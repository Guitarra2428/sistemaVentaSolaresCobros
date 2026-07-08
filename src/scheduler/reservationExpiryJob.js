const { withTx } = require("../db/pool");
const { logger } = require("../logger");
const { one } = require("../db/pool");

async function systemActor() {
  const row = await one(
    `SELECT u.id_usuario, u.nombre, u.id_rol, r.nombre_rol
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
      WHERE r.nombre_rol = 'Administrador' AND u.estado = 'Activo'
      ORDER BY u.id_usuario LIMIT 1`
  );
  return row ? { idUsuario: row.id_usuario, nombre: row.nombre, idRol: row.id_rol, rol: row.nombre_rol } : null;
}

/**
 * Expira reservas cuya fecha_expiracion pasó y siguen Activa.
 * Si el solar aún está Reservado (no fue vendido), lo devuelve a Disponible.
 */
async function expireReservations() {
  const actor = await systemActor();
  return withTx(async (client) => {
    // Buscar candidatas (bloqueando la fila)
    const { rows: reservas } = await client.query(
      `SELECT r.id_reserva, r.id_solar
         FROM reservas r
        WHERE r.estado = 'Activa' AND r.fecha_expiracion < CURRENT_DATE
        FOR UPDATE`
    );

    let expiradas = 0, solaresLiberados = 0;
    for (const r of reservas) {
      await client.query(
        `UPDATE reservas SET estado = 'Expirada', fecha_modificacion = now() WHERE id_reserva = $1`,
        [r.id_reserva]
      );
      expiradas++;

      // Liberar solar SOLO si sigue Reservado (no fue convertido en venta)
      const solar = await client.query(
        "SELECT estado FROM solares WHERE id_solar = $1 FOR UPDATE",
        [r.id_solar]
      );
      if (solar.rowCount && solar.rows[0].estado === "Reservado") {
        await client.query(
          `UPDATE solares SET estado = 'Disponible', tipo_bloqueo = NULL,
                              fecha_modificacion = now(), id_usuario_modifica = $2
            WHERE id_solar = $1`,
          [r.id_solar, actor ? actor.idUsuario : null]
        );
        solaresLiberados++;
      }

      if (actor) {
        await client.query(
          `INSERT INTO auditoria (id_usuario, accion, entidad_afectada, id_entidad_afectada, detalle)
           VALUES ($1, $2, $3, $4, $5)`,
          [actor.idUsuario, "Expirar reserva", "reservas", String(r.id_reserva), JSON.stringify({ solar: r.id_solar })]
        );
      }
    }
    if (expiradas > 0) {
      logger.info({ expiradas, solaresLiberados }, "Reservas expiradas");
    }
    return { expiradas, solaresLiberados };
  });
}

function parseHHmm(text, fallback = { hour: 3, minute: 0 }) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text || "").trim());
  return m ? { hour: Math.min(23, Number(m[1])), minute: Math.min(59, Number(m[2])) } : fallback;
}

function msUntilNext(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

function start(runAtTime = "03:00") {
  const { hour, minute } = parseHHmm(runAtTime);
  const schedule = () => {
    const delay = msUntilNext(hour, minute);
    logger.info({ nextRunInMs: delay, at: `${hour}:${String(minute).padStart(2, "0")}` }, "Scheduler expiración reservas armado");
    return setTimeout(async () => {
      try { await expireReservations(); } catch (err) { logger.error({ err: err.message }, "Scheduler expiración falló"); }
      handle = schedule();
    }, delay);
  };
  let handle = schedule();
  return () => clearTimeout(handle);
}

module.exports = { start, expireReservations };

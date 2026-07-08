const { withTx } = require("../db/pool");
const m = require("./apiMappers");
const { audit } = require("./auditService");
const { getNumber } = require("./configService");
const { today, addDays, daysBetween } = require("../utils/date");
const { currency } = require("../utils/format");

/**
 * Genera mora congelada para cuotas cuyo período de gracia ya venció y
 * no tienen una mora activa. Cargo único fijo (spec §6.11 / §11.3).
 */
async function generateLateFees(user) {
  const porcentajeMora = await getNumber("porcentaje_mora", 0.02);
  const diasGracia = await getNumber("dias_gracia_mora", 5);
  const hoy = today();
  const generated = [];

  await withTx(async (client) => {
    const candidatas = await client.query(
      `SELECT bc.id_cuota, bc.id_contrato, bc.fecha_vencimiento, bc.balance_pendiente
         FROM v_balance_cuota bc
         JOIN contratos c ON c.id_contrato = bc.id_contrato
        WHERE c.estado IN ('Activo','En mora')
          AND bc.balance_pendiente > 0
          AND bc.fecha_vencimiento + ($1 || ' days')::interval < CURRENT_DATE
          AND NOT EXISTS (
            SELECT 1 FROM mora m WHERE m.id_cuota = bc.id_cuota
              AND m.estado IN ('Pendiente','Parcialmente pagada')
          )
       FOR UPDATE OF c`,
      [String(diasGracia)]
    );

    for (const row of candidatas.rows) {
      const balance = Number(row.balance_pendiente);
      if (!(balance > 0)) continue;
      const fechaInicio = addDays(row.fecha_vencimiento.toISOString().slice(0, 10), diasGracia + 1);
      const diasAtraso = Math.max(0, daysBetween(row.fecha_vencimiento.toISOString().slice(0, 10), hoy));
      const montoMora = currency(balance * porcentajeMora);
      if (!(montoMora > 0)) continue;

      const { rows: [mora] } = await client.query(
        `INSERT INTO mora (id_cuota, fecha_inicio_mora, dias_atraso, porcentaje_mora,
                           balance_base_calculo, monto_mora, id_usuario_crea)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [row.id_cuota, fechaInicio, diasAtraso, porcentajeMora, balance, montoMora, user.idUsuario]
      );

      // Audita la transición de cuota si cambia
      const cur = await client.query("SELECT estado FROM cuotas WHERE id_cuota = $1", [row.id_cuota]);
      if (cur.rowCount && !["Pagada", "Anulada", "Vencida"].includes(cur.rows[0].estado)) {
        await client.query(
          "UPDATE cuotas SET estado = 'Vencida', fecha_modificacion = now() WHERE id_cuota = $1",
          [row.id_cuota]
        );
        await audit(client, user, "Transición estado cuota", "cuotas", row.id_cuota,
          { antes: cur.rows[0].estado, despues: "Vencida", causa: "generar_mora" });
      }

      // Audita la transición de contrato si cambia
      const curCt = await client.query("SELECT estado FROM contratos WHERE id_contrato = $1", [row.id_contrato]);
      if (curCt.rowCount && curCt.rows[0].estado === "Activo") {
        await client.query(
          "UPDATE contratos SET estado = 'En mora', fecha_modificacion = now() WHERE id_contrato = $1",
          [row.id_contrato]
        );
        await audit(client, user, "Transición estado contrato", "contratos", row.id_contrato,
          { antes: "Activo", despues: "En mora", causa: "generar_mora" });
      }

      generated.push(m.mora(mora));
      await audit(client, user, "Generar mora", "mora", mora.id_mora, mora);
    }
  });

  return generated;
}

module.exports = { generateLateFees };

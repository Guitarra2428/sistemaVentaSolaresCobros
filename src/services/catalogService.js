const { many, one, withTx } = require("../db/pool");
const m = require("./apiMappers");
const { audit } = require("./auditService");
const { ValidationError, NotFoundError, ConflictError } = require("../errors");
const { getNumber } = require("./configService");
const { addDays, today } = require("../utils/date");

// -------- Clientes --------
async function listClientes(filters = {}) {
  const where = [];
  const params = [];
  if (filters.q) {
    params.push(`%${String(filters.q).toLowerCase()}%`);
    where.push(`(lower(nombre_completo) LIKE $${params.length} OR lower(cedula_rnc) LIKE $${params.length})`);
  }
  if (filters.estado) { params.push(filters.estado); where.push(`estado = $${params.length}`); }
  const sql = `SELECT * FROM clientes ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY id_cliente DESC LIMIT 500`;
  return (await many(sql, params)).map(m.cliente);
}

async function buscarClientesSimilares(nombreCompleto, cedulaRnc) {
  const nombre = String(nombreCompleto || "").trim();
  const cedula = String(cedulaRnc || "").replace(/[-\s]/g, "");
  if (nombre.length < 3 && cedula.length < 3) return [];
  const params = [`%${nombre.toLowerCase()}%`, `%${cedula}%`];
  return (await many(`
    SELECT * FROM clientes
     WHERE lower(nombre_completo) LIKE $1
        OR regexp_replace(cedula_rnc, '[-\\s]', '', 'g') LIKE $2
     LIMIT 5`, params)).map(m.cliente);
}

async function getCliente(id) {
  const row = await one("SELECT * FROM clientes WHERE id_cliente = $1", [id]);
  return m.cliente(row);
}

async function createCliente(user, payload) {
  if (!payload.nombreCompleto || !payload.cedulaRnc) {
    throw new ValidationError("Nombre completo y cédula/RNC son obligatorios");
  }
  return withTx(async (client) => {
    const existe = await client.query("SELECT 1 FROM clientes WHERE cedula_rnc = $1", [payload.cedulaRnc]);
    if (existe.rowCount) throw new ConflictError("Ya existe un cliente con esa cédula/RNC");

    const { rows: [row] } = await client.query(
      `INSERT INTO clientes (nombre_completo, cedula_rnc, telefono, correo, direccion,
                             fecha_nacimiento, estado_civil, ocupacion, id_usuario_crea)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        payload.nombreCompleto,
        payload.cedulaRnc,
        payload.telefono || null,
        payload.correo || null,
        payload.direccion || null,
        payload.fechaNacimiento || null,
        payload.estadoCivil || null,
        payload.ocupacion || null,
        user.idUsuario
      ]
    );
    await audit(client, user, "Crear cliente", "clientes", row.id_cliente, { cliente: row });
    return m.cliente(row);
  });
}

async function updateCliente(user, id, payload) {
  return withTx(async (client) => {
    const existing = await client.query("SELECT * FROM clientes WHERE id_cliente = $1", [id]);
    if (existing.rowCount === 0) throw new NotFoundError("Cliente no encontrado");

    const fields = ["nombre_completo","telefono","correo","direccion","fecha_nacimiento","estado_civil","ocupacion","estado"];
    const camelMap = { nombre_completo: "nombreCompleto", telefono: "telefono", correo: "correo", direccion: "direccion", fecha_nacimiento: "fechaNacimiento", estado_civil: "estadoCivil", ocupacion: "ocupacion", estado: "estado" };
    const sets = [];
    const values = [];
    for (const f of fields) {
      const camelKey = camelMap[f];
      if (payload[camelKey] !== undefined) {
        values.push(payload[camelKey]);
        sets.push(`${f} = $${values.length}`);
      }
    }
    if (sets.length === 0) return m.cliente(existing.rows[0]);
    sets.push(`fecha_modificacion = now()`);
    values.push(user.idUsuario);
    sets.push(`id_usuario_modifica = $${values.length}`);
    values.push(id);
    const { rows: [row] } = await client.query(
      `UPDATE clientes SET ${sets.join(", ")} WHERE id_cliente = $${values.length} RETURNING *`,
      values
    );
    await audit(client, user, "Actualizar cliente", "clientes", id, { antes: existing.rows[0], despues: row });
    return m.cliente(row);
  });
}

// -------- Proyectos --------
async function listProyectos() {
  return (await many("SELECT * FROM proyectos ORDER BY id_proyecto")).map(m.proyecto);
}

async function createProyecto(user, payload) {
  if (!payload.nombre) throw new ValidationError("El nombre del proyecto es obligatorio");
  return withTx(async (client) => {
    const { rows: [row] } = await client.query(
      `INSERT INTO proyectos (nombre, ubicacion, descripcion, cantidad_solares, id_usuario_crea)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [payload.nombre, payload.ubicacion || null, payload.descripcion || null, payload.cantidadSolares || null, user.idUsuario]
    );
    await audit(client, user, "Crear proyecto", "proyectos", row.id_proyecto, { proyecto: row });
    return m.proyecto(row);
  });
}

// -------- Solares --------
async function listSolares() {
  return (await many("SELECT * FROM solares ORDER BY id_solar")).map(m.solar);
}

async function createSolar(user, payload) {
  if (!payload.idProyecto || !payload.manzana || !payload.numeroSolar) {
    throw new ValidationError("Proyecto, manzana y número de solar son obligatorios");
  }
  const metros = Number(payload.metrosCuadrados);
  const precioMetro = Number(payload.precioPorMetro);
  if (!(metros > 0) || !(precioMetro > 0)) throw new ValidationError("Metros y precio por metro deben ser positivos");
  const precioTotal = Math.round(metros * precioMetro * 100) / 100;

  return withTx(async (client) => {
    try {
      const { rows: [row] } = await client.query(
        `INSERT INTO solares (id_proyecto, manzana, numero_solar, metros_cuadrados, precio_por_metro,
                              precio_total, ubicacion_ref, observaciones, id_usuario_crea)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [payload.idProyecto, payload.manzana, payload.numeroSolar, metros, precioMetro, precioTotal,
         payload.ubicacionRef || null, payload.observaciones || null, user.idUsuario]
      );
      await audit(client, user, "Crear solar", "solares", row.id_solar, { solar: row });
      return m.solar(row);
    } catch (err) {
      if (err.code === "23505") throw new ConflictError("Ya existe un solar con esa manzana y número en el proyecto");
      throw err;
    }
  });
}

// -------- Reservas --------
async function listReservas() {
  return (await many("SELECT * FROM reservas ORDER BY id_reserva DESC")).map(m.reserva);
}

async function createReserva(user, payload) {
  if (!payload.idSolar || !payload.idCliente) throw new ValidationError("Solar y cliente son obligatorios");
  const diasDefault = await getNumber("dias_reserva_default", 15);
  const idVendedor = payload.idVendedor || user.idUsuario;
  const fechaExp = payload.fechaExpiracion || addDays(today(), diasDefault);

  return withTx(async (client) => {
    const solar = await client.query("SELECT * FROM solares WHERE id_solar = $1 FOR UPDATE", [payload.idSolar]);
    if (solar.rowCount === 0) throw new NotFoundError("Solar no encontrado");
    if (solar.rows[0].estado !== "Disponible") throw new ConflictError("Solo se puede reservar un solar disponible");

    try {
      const { rows: [row] } = await client.query(
        `INSERT INTO reservas (id_solar, id_cliente, id_vendedor, fecha_expiracion, id_usuario_crea)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [payload.idSolar, payload.idCliente, idVendedor, fechaExp, user.idUsuario]
      );
      await client.query("UPDATE solares SET estado = 'Reservado', fecha_modificacion = now(), id_usuario_modifica = $2 WHERE id_solar = $1",
        [payload.idSolar, user.idUsuario]);
      await audit(client, user, "Crear reserva", "reservas", row.id_reserva, { reserva: row });
      return m.reserva(row);
    } catch (err) {
      if (err.code === "23505") throw new ConflictError("Ya existe una reserva activa para ese solar");
      throw err;
    }
  });
}

async function cancelReserva(user, id, motivo) {
  if (!motivo || String(motivo).trim().length < 3) {
    throw new ValidationError("Motivo obligatorio (mínimo 3 caracteres)");
  }
  return withTx(async (client) => {
    const r = await client.query("SELECT * FROM reservas WHERE id_reserva = $1 FOR UPDATE", [id]);
    if (r.rowCount === 0) throw new NotFoundError("Reserva no encontrada");
    const reserva = r.rows[0];
    if (reserva.estado !== "Activa") {
      throw new ConflictError(`Solo se puede cancelar una reserva Activa (actual: ${reserva.estado})`);
    }

    await client.query(
      `UPDATE reservas SET estado = 'Cancelada', fecha_modificacion = now(), id_usuario_modifica = $2
        WHERE id_reserva = $1`,
      [id, user.idUsuario]
    );

    // Liberar solar solo si sigue Reservado (respeta bloqueos posteriores)
    const solar = await client.query("SELECT estado FROM solares WHERE id_solar = $1 FOR UPDATE", [reserva.id_solar]);
    if (solar.rowCount && solar.rows[0].estado === "Reservado") {
      await client.query(
        `UPDATE solares SET estado = 'Disponible', tipo_bloqueo = NULL,
                            fecha_modificacion = now(), id_usuario_modifica = $2
          WHERE id_solar = $1`,
        [reserva.id_solar, user.idUsuario]
      );
    }

    await audit(client, user, "Cancelar reserva", "reservas", id, { motivo, solar: reserva.id_solar });
    return { ok: true, idReserva: id, motivo };
  });
}

// -------- Usuarios (solo lectura) --------
async function listUsuarios() {
  const rows = await many(`SELECT u.id_usuario, u.nombre, u.correo, u.nombre_acceso, u.estado, r.nombre_rol
                             FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol ORDER BY u.id_usuario`);
  return rows.map(m.usuario);
}

async function listRoles() {
  return (await many("SELECT * FROM roles ORDER BY id_rol")).map((r) => m.rol(r, []));
}

module.exports = {
  listClientes, getCliente, createCliente, updateCliente,
  buscarClientesSimilares,
  listProyectos, createProyecto,
  listSolares, createSolar,
  listReservas, createReserva, cancelReserva,
  listUsuarios, listRoles
};

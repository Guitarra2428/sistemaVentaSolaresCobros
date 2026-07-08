const { env } = require("../config/env");
const { logger } = require("../logger");
const { generateLateFees } = require("../services/lateFeeService");
const { one } = require("../db/pool");

// Actor virtual "SISTEMA": usamos el usuario Administrador con id_usuario más bajo activo.
// En producción se puede crear un usuario dedicado "sistema".
async function systemActor() {
  const row = await one(
    `SELECT u.id_usuario, u.nombre, u.id_rol, r.nombre_rol
       FROM usuarios u JOIN roles r ON r.id_rol = u.id_rol
      WHERE r.nombre_rol = 'Administrador' AND u.estado = 'Activo'
      ORDER BY u.id_usuario LIMIT 1`
  );
  if (!row) return null;
  return { idUsuario: row.id_usuario, nombre: row.nombre, idRol: row.id_rol, rol: row.nombre_rol };
}

function parseHHmm(text) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(text).trim());
  if (!m) return { hour: 2, minute: 0 };
  return { hour: Math.min(23, Number(m[1])), minute: Math.min(59, Number(m[2])) };
}

function msUntilNext(hour, minute) {
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next - now;
}

async function runOnce() {
  const actor = await systemActor();
  if (!actor) {
    logger.warn("Scheduler mora: no hay usuario administrador activo, se omite ejecución");
    return { generated: [] };
  }
  const started = Date.now();
  try {
    const generated = await generateLateFees(actor);
    logger.info({ count: generated.length, ms: Date.now() - started }, "Scheduler mora ejecutado");
    return { generated };
  } catch (err) {
    logger.error({ err: err.message }, "Scheduler mora falló");
    throw err;
  }
}

function start() {
  const { hour, minute } = parseHHmm(env.LATE_FEE_JOB_TIME);
  const schedule = () => {
    const delay = msUntilNext(hour, minute);
    logger.info({ nextRunInMs: delay, at: `${hour}:${String(minute).padStart(2, "0")}` }, "Scheduler mora armado");
    return setTimeout(async () => {
      try { await runOnce(); } catch (_) { /* ya loggeado */ }
      handle = schedule();
    }, delay);
  };
  let handle = schedule();
  return () => clearTimeout(handle);
}

module.exports = { start, runOnce };

const { one, many, q } = require("../db/pool");
const mp = require("./apiMappers");
const { UnauthorizedError, ForbiddenError } = require("../errors");
const { verifyPassword, hashPassword, isBcryptHash } = require("../utils/hash");
const { sign, verify, extractBearer } = require("./tokenService");
const { logger } = require("../logger");

function publicUser(row) {
  return mp.usuario(row);
}

async function permisosDeRol(idRol) {
  const rows = await many(
    "SELECT funcion FROM permisos_rol WHERE id_rol = $1 AND permitido = true",
    [idRol]
  );
  return rows.map((r) => r.funcion);
}

async function findUserByLogin(nombreAcceso) {
  return one(
    `SELECT u.*, r.nombre_rol FROM usuarios u
       JOIN roles r ON r.id_rol = u.id_rol
      WHERE u.nombre_acceso = $1 AND u.estado = 'Activo'`,
    [nombreAcceso]
  );
}

async function findUserById(idUsuario) {
  return one(
    `SELECT u.*, r.nombre_rol FROM usuarios u
       JOIN roles r ON r.id_rol = u.id_rol WHERE u.id_usuario = $1`,
    [idUsuario]
  );
}

async function sessionFor(userRow) {
  const permisos = await permisosDeRol(userRow.id_rol);
  const token = sign({
    idUsuario: userRow.id_usuario,
    idRol: userRow.id_rol,
    rol: userRow.nombre_rol,
    nombre: userRow.nombre
  });
  const user = publicUser(userRow);
  user.passwordDebeCambiar = !!userRow.password_debe_cambiar;
  return { user, permisos, token };
}

async function cambiarPassword(actor, { passwordActual, passwordNuevo }) {
  if (!passwordActual || !passwordNuevo) {
    throw new (require("../errors").ValidationError)("Contraseña actual y nueva son obligatorias");
  }
  if (String(passwordNuevo).length < 8) {
    throw new (require("../errors").ValidationError)("La nueva contraseña debe tener al menos 8 caracteres");
  }
  if (passwordActual === passwordNuevo) {
    throw new (require("../errors").ValidationError)("La nueva contraseña debe ser distinta a la actual");
  }
  const row = await findUserById(actor.idUsuario);
  const ok = await verifyPassword(passwordActual, row.password_hash);
  if (!ok) throw new (require("../errors").UnauthorizedError)("Contraseña actual incorrecta");
  const newHash = await hashPassword(passwordNuevo);
  await q(
    "UPDATE usuarios SET password_hash = $1, password_debe_cambiar = false WHERE id_usuario = $2",
    [newHash, actor.idUsuario]
  );
  logger.info({ idUsuario: actor.idUsuario }, "Contraseña cambiada");
  return { ok: true };
}

async function login({ usuario, password }) {
  const row = await findUserByLogin(usuario);
  if (!row) throw new UnauthorizedError("Credenciales inválidas");
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) throw new UnauthorizedError("Credenciales inválidas");

  // Rehash oportunista: si la contraseña estaba en texto plano (semilla legacy),
  // la migramos a bcrypt en el primer login exitoso.
  if (!isBcryptHash(row.password_hash)) {
    try {
      const newHash = await hashPassword(password);
      await q("UPDATE usuarios SET password_hash = $1 WHERE id_usuario = $2", [newHash, row.id_usuario]);
      logger.info({ idUsuario: row.id_usuario }, "Contraseña migrada a bcrypt");
    } catch (e) {
      logger.warn({ err: e.message }, "No se pudo rehashear contraseña");
    }
  }

  return sessionFor(row);
}

async function resolveActorFromRequest(req) {
  const authHeader = req.headers["authorization"];
  const token = extractBearer(authHeader);
  if (!token) throw new UnauthorizedError("Token no proporcionado");
  const payload = verify(token);
  const row = await findUserById(payload.idUsuario);
  if (!row) throw new UnauthorizedError("Usuario no encontrado");
  if (row.estado !== "Activo") throw new UnauthorizedError("Usuario inactivo");
  return { idUsuario: row.id_usuario, nombre: row.nombre, idRol: row.id_rol, rol: row.nombre_rol };
}

async function requirePermission(actor, funcion) {
  if (actor.rol === "Administrador") return;
  const permitido = await one(
    "SELECT 1 FROM permisos_rol WHERE id_rol = $1 AND funcion = $2 AND permitido = true",
    [actor.idRol, funcion]
  );
  if (!permitido) throw new ForbiddenError(`Rol ${actor.rol} no puede ejecutar '${funcion}'`);
}

module.exports = { login, resolveActorFromRequest, sessionFor, requirePermission, publicUser, findUserById, cambiarPassword };

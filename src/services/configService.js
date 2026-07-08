const { many, one, withTx } = require("../db/pool");
const mp = require("./apiMappers");
const { audit } = require("./auditService");
const { ValidationError } = require("../errors");

// Cache in-memory de configuración. TTL 60s. Invalida cuando updateMany se ejecuta.
const CACHE_TTL_MS = 60_000;
let cacheRaw = null;
let cacheExpiresAt = 0;

function invalidateCache() { cacheRaw = null; cacheExpiresAt = 0; }

async function getAllRaw() {
  const now = Date.now();
  if (cacheRaw && now < cacheExpiresAt) return cacheRaw;
  const rows = await many("SELECT clave, valor FROM configuracion WHERE estado = 'Activo' ORDER BY clave");
  cacheRaw = Object.fromEntries(rows.map((r) => [r.clave, r.valor]));
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cacheRaw;
}

async function getAll() {
  return mp.configuracion(await getAllRaw());
}

async function get(clave) {
  const raw = await getAllRaw();
  return raw[clave] != null ? raw[clave] : null;
}

async function getNumber(clave, fallback) {
  const v = await get(clave);
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

async function updateMany(user, patchCamel) {
  if (!patchCamel || typeof patchCamel !== "object") throw new ValidationError("Payload inválido");
  const patch = mp.configPayloadFromApi(patchCamel);
  const keys = Object.keys(patch);
  if (keys.length === 0) return getAll();

  return withTx(async (client) => {
    for (const clave of keys) {
      const valor = String(patch[clave]);
      const exists = await client.query("SELECT 1 FROM configuracion WHERE clave = $1", [clave]);
      if (exists.rowCount === 0) {
        await client.query(
          "INSERT INTO configuracion (clave, valor, id_usuario_crea) VALUES ($1, $2, $3)",
          [clave, valor, user.idUsuario]
        );
      } else {
        await client.query(
          "UPDATE configuracion SET valor = $1, fecha_modificacion = now(), id_usuario_modifica = $2 WHERE clave = $3",
          [valor, user.idUsuario, clave]
        );
      }
    }
    await audit(client, user, "Actualizar configuración", "configuracion", "general", patch);
    const rows = await client.query("SELECT clave, valor FROM configuracion WHERE estado = 'Activo' ORDER BY clave");
    invalidateCache();
    return mp.configuracion(Object.fromEntries(rows.rows.map((r) => [r.clave, r.valor])));
  });
}

module.exports = { getAll, get, getNumber, updateMany };

async function audit(client, user, accion, entidad, entidadId, detalle) {
  await client.query(
    `INSERT INTO auditoria (id_usuario, accion, entidad_afectada, id_entidad_afectada, detalle)
     VALUES ($1, $2, $3, $4, $5)`,
    [user ? user.idUsuario : null, accion, entidad, String(entidadId), detalle ? JSON.stringify(detalle) : null]
  );
}

module.exports = { audit };

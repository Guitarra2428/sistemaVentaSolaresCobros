const { withTx } = require("../db/pool");
const m = require("./apiMappers");
const { audit } = require("./auditService");
const { currency } = require("../utils/format");
const { today } = require("../utils/date");
const { ValidationError, NotFoundError, ConflictError } = require("../errors");

const TIPOS_VALIDOS = ["Inicial", "Cuota", "Mora", "Adelanto", "Abono a capital"];

async function loadContract(client, idContrato) {
  const r = await client.query("SELECT * FROM contratos WHERE id_contrato = $1 FOR UPDATE", [idContrato]);
  if (r.rowCount === 0) throw new NotFoundError("Contrato no encontrado");
  return r.rows[0];
}

async function loadVentaByContract(client, idContrato) {
  const r = await client.query(
    "SELECT v.* FROM ventas v JOIN contratos c ON c.id_venta = v.id_venta WHERE c.id_contrato = $1 FOR UPDATE",
    [idContrato]
  );
  return r.rows[0];
}

async function balanceCuota(client, idCuota) {
  const r = await client.query("SELECT * FROM v_balance_cuota WHERE id_cuota = $1", [idCuota]);
  return r.rows[0] || null;
}

async function balanceMora(client, idMora) {
  const r = await client.query("SELECT * FROM v_balance_mora WHERE id_mora = $1", [idMora]);
  return r.rows[0] || null;
}

function validateTipoContraEstado(tipo, estadoContrato) {
  if (tipo === "Inicial" && estadoContrato !== "Pendiente de inicial") {
    throw new ConflictError("El cobro Inicial solo aplica a contratos 'Pendiente de inicial'");
  }
  if (["Cuota", "Mora", "Adelanto", "Abono a capital"].includes(tipo)
      && !["Activo", "En mora"].includes(estadoContrato)) {
    throw new ConflictError(`Este tipo de cobro requiere contrato Activo o En mora (actual: ${estadoContrato})`);
  }
}

async function refreshEstadoCuota(client, idCuota, user) {
  const cur = await client.query("SELECT estado FROM cuotas WHERE id_cuota = $1", [idCuota]);
  if (cur.rowCount === 0) return;
  const estadoActual = cur.rows[0].estado;
  // No tocar cuotas anuladas: la anulación es un cambio manual y no vuelve por balance.
  if (estadoActual === "Anulada") return;

  const bal = await balanceCuota(client, idCuota);
  if (!bal) return;
  let nuevoEstado = "Pendiente";
  if (Number(bal.balance_pendiente) <= 0) nuevoEstado = "Pagada";
  else if (Number(bal.monto_pagado) > 0) nuevoEstado = "Parcialmente pagada";
  // Si la cuota estaba Vencida y sigue con balance, respeta ese estado (lo mantiene el job de mora)
  if (estadoActual === "Vencida" && nuevoEstado === "Pendiente") nuevoEstado = "Vencida";

  if (nuevoEstado !== estadoActual) {
    await client.query("UPDATE cuotas SET estado = $1, fecha_modificacion = now() WHERE id_cuota = $2", [nuevoEstado, idCuota]);
    if (user) await audit(client, user, "Transición estado cuota", "cuotas", idCuota, { antes: estadoActual, despues: nuevoEstado });
  }
}

async function refreshEstadoMora(client, idMora, user) {
  const cur = await client.query("SELECT estado FROM mora WHERE id_mora = $1", [idMora]);
  if (cur.rowCount === 0) return;
  const estadoActual = cur.rows[0].estado;
  if (estadoActual === "Anulada") return;

  const bal = await balanceMora(client, idMora);
  if (!bal) return;
  let nuevoEstado = "Pendiente";
  if (Number(bal.balance_pendiente) <= 0) nuevoEstado = "Pagada";
  else if (Number(bal.monto_pagado) > 0) nuevoEstado = "Parcialmente pagada";

  if (nuevoEstado !== estadoActual) {
    await client.query("UPDATE mora SET estado = $1, fecha_modificacion = now() WHERE id_mora = $2", [nuevoEstado, idMora]);
    if (user) await audit(client, user, "Transición estado mora", "mora", idMora, { antes: estadoActual, despues: nuevoEstado });
  }
}

async function refreshEstadoContrato(client, idContrato, user) {
  const c = await client.query("SELECT estado FROM contratos WHERE id_contrato = $1", [idContrato]);
  if (c.rowCount === 0) return;
  const estadoActual = c.rows[0].estado;
  if (!["Activo", "En mora"].includes(estadoActual)) return;

  // 1) Detectar mora activa
  const hasActiveMora = await client.query(
    `SELECT 1 FROM mora m JOIN cuotas cu ON cu.id_cuota = m.id_cuota
      WHERE cu.id_contrato = $1 AND m.estado IN ('Pendiente','Parcialmente pagada') LIMIT 1`,
    [idContrato]
  );

  // 2) Detectar cuotas realmente pendientes (no anuladas, no pagadas)
  const cuotasNoTerminadas = await client.query(
    `SELECT COUNT(*)::int AS n
       FROM cuotas
      WHERE id_contrato = $1 AND estado NOT IN ('Pagada','Anulada')`,
    [idContrato]
  );

  // Solo puede saldarse si NO hay cuotas pendientes NI moras activas
  const puedeSaldar = hasActiveMora.rowCount === 0 && cuotasNoTerminadas.rows[0].n === 0;

  let nuevoEstado;
  if (puedeSaldar) nuevoEstado = "Saldado";
  else if (hasActiveMora.rowCount > 0) nuevoEstado = "En mora";
  else nuevoEstado = "Activo";

  if (nuevoEstado !== estadoActual) {
    await client.query("UPDATE contratos SET estado = $1, fecha_modificacion = now() WHERE id_contrato = $2",
      [nuevoEstado, idContrato]);
    if (user) await audit(client, user, "Transición estado contrato", "contratos", idContrato,
      { antes: estadoActual, despues: nuevoEstado });

    // Si el contrato se saldó, marcar la venta como Saldada también
    if (nuevoEstado === "Saldado") {
      await client.query(
        `UPDATE ventas SET estado = 'Saldada', fecha_modificacion = now()
           WHERE id_venta = (SELECT id_venta FROM contratos WHERE id_contrato = $1)
             AND estado NOT IN ('Anulada','Cancelada','Saldada')`,
        [idContrato]
      );
    }
  }
}

async function createCollection(user, payload) {
  if (!payload.idContrato) throw new ValidationError("idContrato es obligatorio");
  const tipo = payload.tipoAplicacion;
  if (!TIPOS_VALIDOS.includes(tipo)) throw new ValidationError(`Tipo de aplicación inválido: ${tipo}`);
  const monto = currency(Number(payload.monto));
  if (!(monto > 0)) throw new ValidationError("Monto debe ser mayor que 0");
  if (tipo === "Abono a capital" && (!payload.motivoRenegociacion || String(payload.motivoRenegociacion).trim().length < 3)) {
    throw new ValidationError("El abono a capital exige un motivo de renegociación");
  }

  return withTx(async (client) => {
    const contrato = await loadContract(client, payload.idContrato);
    validateTipoContraEstado(tipo, contrato.estado);
    const venta = await loadVentaByContract(client, contrato.id_contrato);
    if (!venta) throw new ConflictError("El contrato no tiene venta asociada");

    // Validar referencia según tipo
    let idCuota = null;
    let idMora = null;
    if (["Cuota", "Adelanto"].includes(tipo)) {
      if (!payload.idCuota) throw new ValidationError("Debe seleccionar una cuota");
      const cu = await client.query("SELECT * FROM cuotas WHERE id_cuota = $1 AND id_contrato = $2 FOR UPDATE",
        [payload.idCuota, contrato.id_contrato]);
      if (cu.rowCount === 0) throw new ValidationError("La cuota no pertenece a este contrato");
      if (cu.rows[0].estado === "Anulada") throw new ConflictError("La cuota está anulada");
      if (tipo === "Cuota") {
        const bal = await balanceCuota(client, payload.idCuota);
        if (monto > Number(bal.balance_pendiente)) {
          throw new ValidationError(`Monto excede el balance pendiente de la cuota (${bal.balance_pendiente})`);
        }
      }
      idCuota = payload.idCuota;
    }
    if (tipo === "Mora") {
      if (!payload.idMora) throw new ValidationError("Debe seleccionar una mora");
      const m = await client.query("SELECT m.* FROM mora m JOIN cuotas cu ON cu.id_cuota = m.id_cuota WHERE m.id_mora = $1 AND cu.id_contrato = $2 FOR UPDATE",
        [payload.idMora, contrato.id_contrato]);
      if (m.rowCount === 0) throw new ValidationError("La mora no pertenece a este contrato");
      const bal = await balanceMora(client, payload.idMora);
      if (monto > Number(bal.balance_pendiente)) {
        throw new ValidationError(`Monto excede el balance pendiente de la mora (${bal.balance_pendiente})`);
      }
      idMora = payload.idMora;
    }
    if (tipo === "Inicial") {
      const inicialPagado = await client.query(
        `SELECT COALESCE(SUM(dc.monto_aplicado), 0) AS pagado
           FROM detalle_cobro dc JOIN cobros co ON co.id_cobro = dc.id_cobro
          WHERE co.id_contrato = $1 AND co.estado = 'Registrado' AND dc.tipo_aplicacion = 'Inicial'`,
        [contrato.id_contrato]
      );
      const yaPagado = Number(inicialPagado.rows[0].pagado);
      if (yaPagado + monto > Number(venta.monto_inicial) + 0.001) {
        throw new ValidationError(`El total inicial (${yaPagado + monto}) excede el monto inicial de la venta (${venta.monto_inicial})`);
      }
    }

    // Insertar cobro (numero_recibo derivado del id)
    const { rows: [cobroRaw] } = await client.query(
      `INSERT INTO cobros (numero_recibo, id_cliente, id_contrato, id_usuario, fecha_pago, monto_total,
                           metodo_pago, referencia_pago, modalidad_aplicacion, id_usuario_crea)
       VALUES ('TMP-' || substring(md5(random()::text || clock_timestamp()::text) for 20), $1, $2, $3, $4, $5, $6, $7, $8, $3)
       RETURNING *`,
      [venta.id_cliente, contrato.id_contrato, user.idUsuario, payload.fechaPago || today(), monto,
       payload.metodoPago || "Efectivo", payload.referenciaPago || null,
       payload.modalidadAplicacion || (tipo === "Abono a capital" ? "Abono a capital" : (idCuota || idMora ? "Cuota especifica" : "Automatica"))]
    );
    const numeroRecibo = `REC-${String(cobroRaw.id_cobro).padStart(6, "0")}`;
    const { rows: [cobro] } = await client.query(
      "UPDATE cobros SET numero_recibo = $1 WHERE id_cobro = $2 RETURNING *",
      [numeroRecibo, cobroRaw.id_cobro]
    );

    // Insertar detalle
    const { rows: [detalle] } = await client.query(
      `INSERT INTO detalle_cobro (id_cobro, id_cuota, id_mora, tipo_aplicacion, monto_aplicado)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [cobro.id_cobro, idCuota, idMora, tipo, monto]
    );

    // Efectos del cobro
    if (tipo === "Inicial") {
      // El inicial debe cubrir el monto_inicial completo (según spec)
      const inicialPagadoTotal = await client.query(
        `SELECT COALESCE(SUM(dc.monto_aplicado), 0) AS pagado
           FROM detalle_cobro dc JOIN cobros co ON co.id_cobro = dc.id_cobro
          WHERE co.id_contrato = $1 AND co.estado = 'Registrado' AND dc.tipo_aplicacion = 'Inicial'`,
        [contrato.id_contrato]
      );
      if (Number(inicialPagadoTotal.rows[0].pagado) >= Number(venta.monto_inicial) - 0.001) {
        await client.query(
          "UPDATE contratos SET estado = 'Activo', fecha_modificacion = now() WHERE id_contrato = $1",
          [contrato.id_contrato]
        );
        await client.query(
          `UPDATE solares SET estado = 'Vendido', tipo_bloqueo = NULL,
                              fecha_modificacion = now(), id_usuario_modifica = $2
            WHERE id_solar = $1`,
          [venta.id_solar, user.idUsuario]
        );
      }
    }

    if (["Cuota", "Adelanto"].includes(tipo)) {
      await refreshEstadoCuota(client, idCuota, user);
    }
    if (tipo === "Mora") {
      await refreshEstadoMora(client, idMora, user);
    }
    if (tipo === "Abono a capital") {
      // No modificar campos históricos de `ventas` (protegidos por CHECK).
      // El abono se refleja como monto aplicado en detalle_cobro; el balance
      // pendiente lo calcula v_balance_contrato. La renegociación formal debe
      // recalcular el plan vía POST /api/renegociaciones.
      const nuevoFinanciadoLogico = currency(Math.max(0, Number(venta.monto_financiado) - monto));
      await client.query(
        `INSERT INTO renegociaciones (id_contrato, id_cobro_origen, motivo, condiciones_anteriores, condiciones_nuevas, id_usuario_autoriza, id_usuario_crea)
         VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $6)`,
        [contrato.id_contrato, cobro.id_cobro, payload.motivoRenegociacion,
         JSON.stringify({ montoFinanciado: Number(venta.monto_financiado), cantidadCuotas: venta.cantidad_cuotas }),
         JSON.stringify({ abonoCapital: monto, montoFinanciadoLogicoRestante: nuevoFinanciadoLogico, nota: "Requiere renegociación formal para recalcular plan" }),
         payload.idUsuarioAutoriza || user.idUsuario]
      );
    }

    await refreshEstadoContrato(client, contrato.id_contrato, user);
    await audit(client, user, `Registrar cobro (${tipo})`, "cobros", cobro.id_cobro,
      { cobro, detalle });

    return { cobro: m.cobro(cobro), detalle: m.detalleCobro(detalle) };
  });
}

async function anularCobro(user, idCobro, motivo) {
  if (!motivo || String(motivo).trim().length < 3) throw new ValidationError("Motivo de anulación es obligatorio");
  return withTx(async (client) => {
    const c = await client.query("SELECT * FROM cobros WHERE id_cobro = $1 FOR UPDATE", [idCobro]);
    if (c.rowCount === 0) throw new NotFoundError("Cobro no encontrado");
    if (c.rows[0].estado === "Anulado") throw new ConflictError("El cobro ya está anulado");
    const cobro = c.rows[0];
    const idContrato = cobro.id_contrato;

    // Determinar si este cobro contenía un detalle "Inicial" (para revertir solar si aplica)
    const detalles = await client.query("SELECT id_cuota, id_mora, tipo_aplicacion FROM detalle_cobro WHERE id_cobro = $1", [idCobro]);
    const teniaInicial = detalles.rows.some((d) => d.tipo_aplicacion === "Inicial");

    await client.query(
      `UPDATE cobros SET estado = 'Anulado', motivo_anulacion = $1, fecha_anulacion = now(),
                         id_usuario_anula = $2, fecha_modificacion = now(), id_usuario_modifica = $2
        WHERE id_cobro = $3`,
      [motivo, user.idUsuario, idCobro]
    );

    // Refrescar estados de cuotas/moras afectados (auditados)
    for (const d of detalles.rows) {
      if (d.id_cuota) await refreshEstadoCuota(client, d.id_cuota, user);
      if (d.id_mora) await refreshEstadoMora(client, d.id_mora, user);
    }

    // Si el cobro anulado incluía Inicial y el contrato ya estaba activado, verificamos si
    // el inicial pagado sigue cubriendo el monto_inicial. Si no lo cubre, el contrato debe
    // volver a "Pendiente de inicial" y el solar a "Bloqueado".
    if (teniaInicial) {
      const venta = await client.query(
        "SELECT v.* FROM ventas v JOIN contratos ct ON ct.id_venta = v.id_venta WHERE ct.id_contrato = $1",
        [idContrato]
      );
      const contratoActual = await client.query("SELECT estado FROM contratos WHERE id_contrato = $1", [idContrato]);
      const inicialPagado = await client.query(
        `SELECT COALESCE(SUM(dc.monto_aplicado), 0) AS pagado
           FROM detalle_cobro dc JOIN cobros co ON co.id_cobro = dc.id_cobro
          WHERE co.id_contrato = $1 AND co.estado = 'Registrado' AND dc.tipo_aplicacion = 'Inicial'`,
        [idContrato]
      );
      const cubierto = Number(inicialPagado.rows[0].pagado) >= Number(venta.rows[0].monto_inicial) - 0.001;
      if (!cubierto && ["Activo", "En mora"].includes(contratoActual.rows[0].estado)) {
        // Revertir contrato a Pendiente de inicial y solar a Bloqueado
        await client.query("UPDATE contratos SET estado = 'Pendiente de inicial', fecha_modificacion = now() WHERE id_contrato = $1", [idContrato]);
        await audit(client, user, "Reversión contrato tras anular Inicial", "contratos", idContrato,
          { estado_anterior: contratoActual.rows[0].estado, estado_nuevo: "Pendiente de inicial" });
        await client.query(
          `UPDATE solares
              SET estado = 'Bloqueado', tipo_bloqueo = 'Venta pendiente de inicial',
                  fecha_modificacion = now(), id_usuario_modifica = $2
            WHERE id_solar = $1 AND estado = 'Vendido'`,
          [venta.rows[0].id_solar, user.idUsuario]
        );
        await audit(client, user, "Reversión solar tras anular Inicial", "solares", venta.rows[0].id_solar,
          { estado_nuevo: "Bloqueado", tipo_bloqueo: "Venta pendiente de inicial" });
      } else {
        // Solo refresca por si el balance cambió
        await refreshEstadoContrato(client, idContrato, user);
      }
    } else {
      await refreshEstadoContrato(client, idContrato, user);
    }

    await audit(client, user, "Anular cobro", "cobros", idCobro, { motivo, tenia_inicial: teniaInicial });
    return { ok: true, idCobro, motivo };
  });
}

module.exports = { createCollection, anularCobro, refreshEstadoContrato };

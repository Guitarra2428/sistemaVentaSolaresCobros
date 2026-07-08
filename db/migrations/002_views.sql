-- =====================================================================
-- Migración 002: Vistas de balance (spec §15)
-- Toda esta lógica se implementa como vistas de solo lectura,
-- nunca se almacena como campo fijo editable.
-- =====================================================================

-- ---------------------------------------------------------------------
-- v_balance_cuota — spec §15.1
--   monto_pagado_cuota      = Σ detalle_cobro.monto_aplicado (tipo 'Cuota' o 'Adelanto')
--                             donde id_cuota = cuota y cobro.estado = 'Registrado'
--   balance_pendiente_cuota = cuota.monto - monto_pagado_cuota
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_balance_cuota AS
SELECT
    c.id_cuota,
    c.id_contrato,
    c.numero_cuota,
    c.fecha_vencimiento,
    c.monto,
    c.capital,
    c.interes,
    c.estado,
    COALESCE(pagado.monto_pagado, 0)::NUMERIC(16,2) AS monto_pagado,
    (c.monto - COALESCE(pagado.monto_pagado, 0))::NUMERIC(16,2) AS balance_pendiente
FROM cuotas c
LEFT JOIN LATERAL (
    SELECT SUM(dc.monto_aplicado) AS monto_pagado
    FROM detalle_cobro dc
    JOIN cobros co ON co.id_cobro = dc.id_cobro
    WHERE dc.id_cuota = c.id_cuota
      AND dc.tipo_aplicacion IN ('Cuota','Adelanto')
      AND co.estado = 'Registrado'
) pagado ON TRUE;

-- ---------------------------------------------------------------------
-- v_balance_mora — spec §15.2
--   balance_pendiente_mora = mora.monto_mora - Σ pagos aplicados a esta mora
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_balance_mora AS
SELECT
    m.id_mora,
    m.id_cuota,
    m.monto_mora,
    m.estado,
    m.dias_atraso,
    m.fecha_inicio_mora,
    COALESCE(pagado.monto_pagado, 0)::NUMERIC(16,2) AS monto_pagado,
    (m.monto_mora - COALESCE(pagado.monto_pagado, 0))::NUMERIC(16,2) AS balance_pendiente
FROM mora m
LEFT JOIN LATERAL (
    SELECT SUM(dc.monto_aplicado) AS monto_pagado
    FROM detalle_cobro dc
    JOIN cobros co ON co.id_cobro = dc.id_cobro
    WHERE dc.id_mora = m.id_mora
      AND dc.tipo_aplicacion = 'Mora'
      AND co.estado = 'Registrado'
) pagado ON TRUE;

-- ---------------------------------------------------------------------
-- v_balance_contrato — spec §15.3
--   Para contratos 'Pendiente de inicial':
--       balance = venta.monto_inicial - Σ detalles tipo 'Inicial' registrados
--   Para contratos 'Activo' o 'En mora':
--       balance = Σ cuotas (no anuladas) - Σ pagos a cuotas
--               + Σ balances pendientes de moras activas
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_balance_contrato AS
WITH
inicial_pagado AS (
    SELECT co.id_contrato, SUM(dc.monto_aplicado) AS pagado
    FROM detalle_cobro dc
    JOIN cobros co ON co.id_cobro = dc.id_cobro
    WHERE dc.tipo_aplicacion = 'Inicial' AND co.estado = 'Registrado'
    GROUP BY co.id_contrato
),
cuotas_total AS (
    SELECT id_contrato, SUM(monto) AS total_cuotas
    FROM cuotas
    WHERE estado <> 'Anulada'
    GROUP BY id_contrato
),
cuotas_pagado AS (
    SELECT c.id_contrato, SUM(dc.monto_aplicado) AS total_pagado
    FROM detalle_cobro dc
    JOIN cobros co ON co.id_cobro = dc.id_cobro
    JOIN cuotas c ON c.id_cuota = dc.id_cuota
    WHERE dc.tipo_aplicacion IN ('Cuota','Adelanto')
      AND co.estado = 'Registrado'
    GROUP BY c.id_contrato
),
mora_pendiente AS (
    SELECT c.id_contrato, SUM(bm.balance_pendiente) AS total_mora_pendiente
    FROM v_balance_mora bm
    JOIN cuotas c ON c.id_cuota = bm.id_cuota
    WHERE bm.estado IN ('Pendiente','Parcialmente pagada')
    GROUP BY c.id_contrato
),
abono_capital AS (
    SELECT co.id_contrato, SUM(dc.monto_aplicado) AS total_abono
    FROM detalle_cobro dc
    JOIN cobros co ON co.id_cobro = dc.id_cobro
    WHERE dc.tipo_aplicacion = 'Abono a capital' AND co.estado = 'Registrado'
    GROUP BY co.id_contrato
)
SELECT
    ct.id_contrato,
    ct.numero_contrato,
    ct.estado AS estado_contrato,
    v.monto_inicial,
    v.monto_financiado,
    v.precio_total,
    COALESCE(ip.pagado, 0)::NUMERIC(16,2)               AS inicial_pagado,
    (v.monto_inicial - COALESCE(ip.pagado, 0))::NUMERIC(16,2) AS inicial_pendiente,
    COALESCE(ct2.total_cuotas, 0)::NUMERIC(16,2)         AS total_cuotas,
    COALESCE(cp.total_pagado, 0)::NUMERIC(16,2)          AS total_cuotas_pagado,
    COALESCE(ac.total_abono, 0)::NUMERIC(16,2)           AS total_abono_capital,
    COALESCE(mp.total_mora_pendiente, 0)::NUMERIC(16,2)  AS total_mora_pendiente,
    CASE
        WHEN ct.estado = 'Pendiente de inicial'
            THEN (v.monto_inicial - COALESCE(ip.pagado, 0))::NUMERIC(16,2)
        WHEN ct.estado IN ('Activo','En mora')
            THEN (
                COALESCE(ct2.total_cuotas, 0)
              - COALESCE(cp.total_pagado, 0)
              + COALESCE(mp.total_mora_pendiente, 0)
            )::NUMERIC(16,2)
        ELSE 0::NUMERIC(16,2)
    END AS balance_pendiente
FROM contratos ct
JOIN ventas v ON v.id_venta = ct.id_venta
LEFT JOIN inicial_pagado ip ON ip.id_contrato = ct.id_contrato
LEFT JOIN cuotas_total ct2 ON ct2.id_contrato = ct.id_contrato
LEFT JOIN cuotas_pagado cp ON cp.id_contrato = ct.id_contrato
LEFT JOIN mora_pendiente mp ON mp.id_contrato = ct.id_contrato
LEFT JOIN abono_capital ac ON ac.id_contrato = ct.id_contrato;

-- ---------------------------------------------------------------------
-- v_contratos_renegociados — spec §15.4 (etiqueta derivada)
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW v_contratos_renegociados AS
SELECT DISTINCT id_contrato, true AS es_renegociado
FROM renegociaciones;

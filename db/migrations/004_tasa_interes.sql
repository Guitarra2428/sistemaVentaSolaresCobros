-- =====================================================================
-- Migración 004: Tasa de interés configurable + por venta
-- Antes de esta migración la tasa estaba hardcoded en salesService.js (0.012).
-- Ahora vive en `configuracion` (default global) y en `ventas.tasa_interes_cuota`
-- (por venta, se copia del default al crear la venta).
-- Las ventas existentes quedan con 0.012 explícito (misma tasa que tenían implícita).
-- =====================================================================

INSERT INTO configuracion (clave, valor, descripcion) VALUES
    ('porcentaje_interes_cuota', '0.012', 'Interés por cuota, fracción decimal (0.012 = 1.2%)');

ALTER TABLE ventas
    ADD COLUMN tasa_interes_cuota NUMERIC(6,4) NOT NULL DEFAULT 0.012
        CHECK (tasa_interes_cuota >= 0 AND tasa_interes_cuota < 1);

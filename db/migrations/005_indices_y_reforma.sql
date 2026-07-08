-- =====================================================================
-- Migración 005: Índices adicionales + columna password_debe_cambiar
-- Optimiza reportes filtrados y habilita cambio forzado de contraseña.
-- =====================================================================

-- Índices para acelerar reportes con filtros compuestos comunes
CREATE INDEX IF NOT EXISTS idx_cobros_cliente_fecha ON cobros(id_cliente, fecha_pago DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_vendedor_fecha ON ventas(id_vendedor, fecha_venta DESC);
CREATE INDEX IF NOT EXISTS idx_auditoria_fecha_desc ON auditoria(fecha_hora DESC);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre_trgm ON clientes(lower(nombre_completo));
CREATE INDEX IF NOT EXISTS idx_clientes_cedula_lower ON clientes(lower(cedula_rnc));

-- Flag para forzar cambio de contraseña al primer login
ALTER TABLE usuarios
    ADD COLUMN password_debe_cambiar BOOLEAN NOT NULL DEFAULT false;

-- Los usuarios semilla actuales deben cambiar su contraseña en el próximo login.
UPDATE usuarios SET password_debe_cambiar = true
 WHERE nombre_acceso IN ('admin','vendedor','cajero','gerente');

-- =====================================================================
-- Migración 003: Matriz de permisos por rol (spec §5.2)
-- Función = clave canónica en snake_case; se consulta desde el backend.
-- =====================================================================

-- Administrador: acceso total (comodín se maneja en el servicio auth)
INSERT INTO permisos_rol (id_rol, funcion, permitido)
SELECT r.id_rol, f.funcion, true
FROM roles r
CROSS JOIN (VALUES
    ('crear_usuario'),
    ('crear_cliente'),
    ('editar_cliente'),
    ('registrar_proyecto'),
    ('registrar_solar'),
    ('reservar_solar'),
    ('registrar_venta'),
    ('registrar_cobro_inicial'),
    ('registrar_adelanto'),
    ('registrar_pago_mora'),
    ('registrar_abono_capital'),
    ('anular_venta'),
    ('renegociar_contrato'),
    ('anular_recibo'),
    ('ajustar_anular_mora'),
    ('marcar_comision_pagada'),
    ('consultar_estado_cuenta'),
    ('ver_reportes_ventas'),
    ('ver_reportes_ventas_propias'),
    ('ver_reportes_cobros'),
    ('ver_reportes_cobros_propios'),
    ('ver_reporte_mora'),
    ('ver_reporte_mora_propio'),
    ('ver_reporte_comisiones'),
    ('ver_reporte_comisiones_propias'),
    ('configurar_parametros'),
    ('consultar_auditoria')
) AS f(funcion)
WHERE r.nombre_rol = 'Administrador';

-- Vendedor
INSERT INTO permisos_rol (id_rol, funcion, permitido)
SELECT r.id_rol, f.funcion, true
FROM roles r
CROSS JOIN (VALUES
    ('crear_cliente'),
    ('editar_cliente'),
    ('reservar_solar'),
    ('registrar_venta'),
    ('consultar_estado_cuenta'),
    ('ver_reportes_ventas_propias'),
    ('ver_reporte_comisiones_propias')
) AS f(funcion)
WHERE r.nombre_rol = 'Vendedor';

-- Cajero
INSERT INTO permisos_rol (id_rol, funcion, permitido)
SELECT r.id_rol, f.funcion, true
FROM roles r
CROSS JOIN (VALUES
    ('registrar_cobro_inicial'),
    ('registrar_adelanto'),
    ('registrar_pago_mora'),
    ('consultar_estado_cuenta'),
    ('ver_reportes_cobros_propios'),
    ('ver_reporte_mora_propio')
) AS f(funcion)
WHERE r.nombre_rol = 'Cajero';

-- Gerente
INSERT INTO permisos_rol (id_rol, funcion, permitido)
SELECT r.id_rol, f.funcion, true
FROM roles r
CROSS JOIN (VALUES
    ('crear_cliente'),
    ('editar_cliente'),
    ('reservar_solar'),
    ('registrar_venta'),
    ('registrar_cobro_inicial'),
    ('registrar_adelanto'),
    ('registrar_pago_mora'),
    ('registrar_abono_capital'),
    ('anular_venta'),
    ('renegociar_contrato'),
    ('anular_recibo'),
    ('ajustar_anular_mora'),
    ('marcar_comision_pagada'),
    ('consultar_estado_cuenta'),
    ('ver_reportes_ventas'),
    ('ver_reportes_cobros'),
    ('ver_reporte_mora'),
    ('ver_reporte_comisiones'),
    ('consultar_auditoria')
) AS f(funcion)
WHERE r.nombre_rol = 'Gerente';

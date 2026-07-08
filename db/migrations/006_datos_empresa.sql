-- =====================================================================
-- Migración 006: Datos empresariales para el recibo imprimible
-- Se agregan como claves de configuración para que el Administrador
-- las pueda editar desde la pantalla de Configuración.
-- =====================================================================

INSERT INTO configuracion (clave, valor, descripcion) VALUES
    ('nombre_empresa',    'Nombre de la Inmobiliaria', 'Razón social que aparece en el encabezado del recibo'),
    ('rnc_empresa',       '000-00000-0',              'RNC / cédula fiscal que aparece en el recibo'),
    ('direccion_empresa', 'Dirección completa',        'Dirección física para el recibo'),
    ('telefono_empresa',  '',                         'Teléfono de contacto en el recibo'),
    ('nota_legal_recibo', 'Este recibo es válido como comprobante de pago. Consérvelo.', 'Nota al pie del recibo');

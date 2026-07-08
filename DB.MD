-- =====================================================================
-- Sistema de Administración de Venta de Solares y Gestión de Cobros
-- Script inicial de base de datos — basado en especificación funcional v6.6
-- Motor objetivo: PostgreSQL 14+ (usa índices únicos parciales)
-- =====================================================================
-- Orden de creación respeta las dependencias de llaves foráneas:
-- roles -> usuarios -> permisos_rol -> clientes -> proyectos -> solares
-- -> reservas -> ventas -> contratos -> cuotas -> mora -> cobros
-- -> detalle_cobro -> renegociaciones -> comisiones -> configuracion
-- -> auditoria
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. ROLES
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id_rol          SERIAL PRIMARY KEY,
    nombre_rol      VARCHAR(50) NOT NULL UNIQUE,
    descripcion     VARCHAR(255)
);

-- ---------------------------------------------------------------------
-- 2. USUARIOS
-- ---------------------------------------------------------------------
CREATE TABLE usuarios (
    id_usuario          SERIAL PRIMARY KEY,
    id_rol              INTEGER NOT NULL REFERENCES roles(id_rol),
    nombre              VARCHAR(150) NOT NULL,
    correo              VARCHAR(150) NOT NULL UNIQUE,
    nombre_acceso       VARCHAR(50)  NOT NULL UNIQUE,
    password_hash       VARCHAR(255) NOT NULL,
    estado              VARCHAR(20)  NOT NULL DEFAULT 'Activo'
                            CHECK (estado IN ('Activo','Inactivo')),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now()
);

-- Llaves foráneas de auditoría (id_usuario_crea / id_usuario_modifica) se
-- agregan en cada tabla posterior a esta, ya referenciando usuarios(id_usuario).

-- ---------------------------------------------------------------------
-- 3. PERMISOS_ROL
-- ---------------------------------------------------------------------
CREATE TABLE permisos_rol (
    id_permiso      SERIAL PRIMARY KEY,
    id_rol          INTEGER NOT NULL REFERENCES roles(id_rol),
    funcion         VARCHAR(100) NOT NULL,
    permitido       BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (id_rol, funcion)
);

-- ---------------------------------------------------------------------
-- 4. CLIENTES
-- ---------------------------------------------------------------------
CREATE TABLE clientes (
    id_cliente          SERIAL PRIMARY KEY,
    nombre_completo     VARCHAR(200) NOT NULL,
    cedula_rnc          VARCHAR(20)  NOT NULL UNIQUE,
    telefono            VARCHAR(30),
    correo              VARCHAR(150),
    direccion           VARCHAR(255),
    fecha_nacimiento    DATE,
    estado_civil        VARCHAR(20),
    ocupacion           VARCHAR(100),
    estado              VARCHAR(20)  NOT NULL DEFAULT 'Activo'
                            CHECK (estado IN ('Activo','Inactivo')),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario)
);

-- ---------------------------------------------------------------------
-- 5. PROYECTOS
-- ---------------------------------------------------------------------
CREATE TABLE proyectos (
    id_proyecto         SERIAL PRIMARY KEY,
    nombre              VARCHAR(150) NOT NULL,
    ubicacion           VARCHAR(255),
    descripcion         VARCHAR(500),
    cantidad_solares    INTEGER,
    estado              VARCHAR(20) NOT NULL DEFAULT 'Activo'
                            CHECK (estado IN ('Activo','Inactivo')),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario)
);

-- ---------------------------------------------------------------------
-- 6. SOLARES
-- ---------------------------------------------------------------------
CREATE TABLE solares (
    id_solar            SERIAL PRIMARY KEY,
    id_proyecto         INTEGER NOT NULL REFERENCES proyectos(id_proyecto),
    manzana             VARCHAR(20) NOT NULL,
    numero_solar        VARCHAR(20) NOT NULL,
    metros_cuadrados    NUMERIC(12,2) NOT NULL CHECK (metros_cuadrados > 0),
    precio_por_metro    NUMERIC(14,2) NOT NULL CHECK (precio_por_metro > 0),
    precio_total        NUMERIC(16,2) NOT NULL CHECK (precio_total > 0),
    estado              VARCHAR(20) NOT NULL DEFAULT 'Disponible'
                            CHECK (estado IN ('Disponible','Reservado','Bloqueado','Vendido','Anulado')),
    tipo_bloqueo        VARCHAR(30)
                            CHECK (tipo_bloqueo IN ('Venta pendiente de inicial','Administrativo','Legal','Otro')),
    ubicacion_ref       VARCHAR(255),
    observaciones       VARCHAR(500),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario),
    UNIQUE (id_proyecto, manzana, numero_solar),
    -- tipo_bloqueo solo tiene sentido cuando el solar está Bloqueado
    CONSTRAINT chk_tipo_bloqueo_coherente CHECK (
        (estado = 'Bloqueado' AND tipo_bloqueo IS NOT NULL) OR
        (estado <> 'Bloqueado' AND tipo_bloqueo IS NULL)
    )
);

CREATE INDEX idx_solares_estado ON solares(estado);
CREATE INDEX idx_solares_proyecto ON solares(id_proyecto);

-- ---------------------------------------------------------------------
-- 7. RESERVAS
-- ---------------------------------------------------------------------
CREATE TABLE reservas (
    id_reserva          SERIAL PRIMARY KEY,
    id_solar            INTEGER NOT NULL REFERENCES solares(id_solar),
    id_cliente          INTEGER NOT NULL REFERENCES clientes(id_cliente),
    id_vendedor         INTEGER NOT NULL REFERENCES usuarios(id_usuario),
    fecha_reserva       DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_expiracion    DATE NOT NULL,
    estado              VARCHAR(20) NOT NULL DEFAULT 'Activa'
                            CHECK (estado IN ('Activa','Expirada','Cancelada','Convertida en venta')),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario),
    CHECK (fecha_expiracion >= fecha_reserva)
);

CREATE INDEX idx_reservas_estado ON reservas(estado);
CREATE INDEX idx_reservas_solar ON reservas(id_solar);

-- ---------------------------------------------------------------------
-- 8. VENTAS
-- ---------------------------------------------------------------------
CREATE TABLE ventas (
    id_venta            SERIAL PRIMARY KEY,
    id_cliente          INTEGER NOT NULL REFERENCES clientes(id_cliente),
    id_solar            INTEGER NOT NULL REFERENCES solares(id_solar),
    id_reserva          INTEGER REFERENCES reservas(id_reserva),
    id_vendedor         INTEGER NOT NULL REFERENCES usuarios(id_usuario),
    fecha_venta         DATE NOT NULL DEFAULT CURRENT_DATE,
    precio_total        NUMERIC(16,2) NOT NULL CHECK (precio_total > 0),
    monto_inicial       NUMERIC(16,2) NOT NULL CHECK (monto_inicial >= 0),
    monto_financiado    NUMERIC(16,2) NOT NULL CHECK (monto_financiado >= 0),
    cantidad_cuotas     INTEGER NOT NULL CHECK (cantidad_cuotas > 0),
    monto_cuota         NUMERIC(16,2), -- referencial únicamente, ver sección 6.6 del documento funcional
    frecuencia_pago     VARCHAR(20) NOT NULL
                            CHECK (frecuencia_pago IN ('Mensual','Quincenal','Semanal','Personalizada')),
    fecha_primer_pago   DATE NOT NULL,
    estado              VARCHAR(20) NOT NULL DEFAULT 'Activa'
                            CHECK (estado IN ('Activa','Saldada','Anulada','En mora','Cancelada')),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario),
    CHECK (monto_inicial <= precio_total),
    CHECK (monto_financiado = precio_total - monto_inicial)
);

-- Un solar solo puede estar activamente vendido/bloqueado por UNA venta a la vez.
-- Se controla a nivel de aplicación/transacción (ver notas de triggers), ya que
-- "venta activa" depende del estado del contrato asociado, no solo de esta tabla.
CREATE INDEX idx_ventas_solar ON ventas(id_solar);
CREATE INDEX idx_ventas_cliente ON ventas(id_cliente);
CREATE INDEX idx_ventas_estado ON ventas(estado);

-- ---------------------------------------------------------------------
-- 9. CONTRATOS
-- ---------------------------------------------------------------------
CREATE TABLE contratos (
    id_contrato         SERIAL PRIMARY KEY,
    numero_contrato     VARCHAR(30) NOT NULL UNIQUE,
    id_venta            INTEGER NOT NULL UNIQUE REFERENCES ventas(id_venta),
    fecha_contrato      DATE NOT NULL DEFAULT CURRENT_DATE,
    condiciones_pago    VARCHAR(1000),
    estado              VARCHAR(25) NOT NULL DEFAULT 'Pendiente de inicial'
                            CHECK (estado IN ('Pendiente de inicial','Activo','En mora','Saldado','Cancelado','Anulado')),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario)
);

CREATE INDEX idx_contratos_estado ON contratos(estado);

-- ---------------------------------------------------------------------
-- 10. CUOTAS
-- ---------------------------------------------------------------------
CREATE TABLE cuotas (
    id_cuota            SERIAL PRIMARY KEY,
    id_contrato         INTEGER NOT NULL REFERENCES contratos(id_contrato),
    numero_cuota        INTEGER NOT NULL,
    fecha_vencimiento   DATE NOT NULL,
    monto               NUMERIC(16,2) NOT NULL CHECK (monto > 0),
    capital             NUMERIC(16,2) NOT NULL CHECK (capital >= 0),
    interes             NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (interes >= 0),
    estado              VARCHAR(25) NOT NULL DEFAULT 'Pendiente'
                            CHECK (estado IN ('Pendiente','Pagada','Parcialmente pagada','Vencida','Anulada')),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario),
    UNIQUE (id_contrato, numero_cuota),
    CHECK (monto = capital + interes)
);

CREATE INDEX idx_cuotas_contrato ON cuotas(id_contrato);
CREATE INDEX idx_cuotas_estado ON cuotas(estado);
CREATE INDEX idx_cuotas_vencimiento ON cuotas(fecha_vencimiento);

-- ---------------------------------------------------------------------
-- 11. MORA
-- ---------------------------------------------------------------------
CREATE TABLE mora (
    id_mora             SERIAL PRIMARY KEY,
    id_cuota            INTEGER NOT NULL REFERENCES cuotas(id_cuota),
    fecha_inicio_mora   DATE NOT NULL,
    dias_atraso         INTEGER NOT NULL DEFAULT 0 CHECK (dias_atraso >= 0),
    porcentaje_mora     NUMERIC(6,4) NOT NULL CHECK (porcentaje_mora > 0 AND porcentaje_mora < 1), -- fracción decimal, ej. 0.02
    balance_base_calculo NUMERIC(16,2) NOT NULL CHECK (balance_base_calculo > 0),
    monto_mora          NUMERIC(16,2) NOT NULL CHECK (monto_mora > 0), -- congelado al generarse
    estado              VARCHAR(25) NOT NULL DEFAULT 'Pendiente'
                            CHECK (estado IN ('Pendiente','Parcialmente pagada','Pagada','Anulada')),
    fecha_calculo       TIMESTAMP NOT NULL DEFAULT now(),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario)
);

-- Regla de unicidad clave del documento funcional (sección 6.11):
-- no puede existir más de una mora ACTIVA (Pendiente o Parcialmente pagada)
-- para la misma cuota. Índice único PARCIAL — solo PostgreSQL/SQL Server lo soportan así.
CREATE UNIQUE INDEX uq_mora_activa_por_cuota
    ON mora(id_cuota)
    WHERE estado IN ('Pendiente','Parcialmente pagada');

CREATE INDEX idx_mora_cuota ON mora(id_cuota);
CREATE INDEX idx_mora_estado ON mora(estado);

-- ---------------------------------------------------------------------
-- 12. COBROS
-- ---------------------------------------------------------------------
CREATE TABLE cobros (
    id_cobro            SERIAL PRIMARY KEY,
    numero_recibo       VARCHAR(30) NOT NULL UNIQUE,
    id_cliente          INTEGER NOT NULL REFERENCES clientes(id_cliente),
    id_contrato         INTEGER NOT NULL REFERENCES contratos(id_contrato), -- obligatorio siempre, incluido el inicial
    id_usuario          INTEGER NOT NULL REFERENCES usuarios(id_usuario),
    fecha_pago          DATE NOT NULL DEFAULT CURRENT_DATE,
    monto_total         NUMERIC(16,2) NOT NULL CHECK (monto_total > 0),
    metodo_pago         VARCHAR(20) NOT NULL
                            CHECK (metodo_pago IN ('Efectivo','Transferencia','Deposito','Cheque','Tarjeta','Otro')),
    referencia_pago     VARCHAR(100),
    modalidad_aplicacion VARCHAR(30) NOT NULL
                            CHECK (modalidad_aplicacion IN ('Automatica','Cuota especifica','Abono a capital')),
    estado              VARCHAR(20) NOT NULL DEFAULT 'Registrado'
                            CHECK (estado IN ('Registrado','Anulado')),
    motivo_anulacion    VARCHAR(255),
    fecha_anulacion     TIMESTAMP,
    id_usuario_anula    INTEGER REFERENCES usuarios(id_usuario),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario),
    CHECK ( (estado = 'Anulado' AND motivo_anulacion IS NOT NULL AND fecha_anulacion IS NOT NULL AND id_usuario_anula IS NOT NULL)
         OR (estado = 'Registrado' AND motivo_anulacion IS NULL AND fecha_anulacion IS NULL AND id_usuario_anula IS NULL) )
);

CREATE INDEX idx_cobros_contrato ON cobros(id_contrato);
CREATE INDEX idx_cobros_cliente ON cobros(id_cliente);
CREATE INDEX idx_cobros_fecha ON cobros(fecha_pago);
CREATE INDEX idx_cobros_estado ON cobros(estado);

-- ---------------------------------------------------------------------
-- 13. DETALLE_COBRO
-- ---------------------------------------------------------------------
CREATE TABLE detalle_cobro (
    id_detalle_cobro    SERIAL PRIMARY KEY,
    id_cobro            INTEGER NOT NULL REFERENCES cobros(id_cobro),
    id_cuota            INTEGER REFERENCES cuotas(id_cuota),
    id_mora             INTEGER REFERENCES mora(id_mora),
    tipo_aplicacion     VARCHAR(20) NOT NULL
                            CHECK (tipo_aplicacion IN ('Inicial','Cuota','Mora','Adelanto','Abono a capital')),
    monto_aplicado      NUMERIC(16,2) NOT NULL CHECK (monto_aplicado > 0),
    -- Reglas de referencia por tipo (sección 6.10 / 10 del documento funcional):
    CONSTRAINT chk_detalle_referencias CHECK (
        (tipo_aplicacion IN ('Cuota','Adelanto') AND id_cuota IS NOT NULL AND id_mora IS NULL)
     OR (tipo_aplicacion = 'Mora' AND id_mora IS NOT NULL AND id_cuota IS NULL)
     OR (tipo_aplicacion IN ('Inicial','Abono a capital') AND id_cuota IS NULL AND id_mora IS NULL)
    )
);

CREATE INDEX idx_detalle_cobro ON detalle_cobro(id_cobro);
CREATE INDEX idx_detalle_cuota ON detalle_cobro(id_cuota);
CREATE INDEX idx_detalle_mora ON detalle_cobro(id_mora);

-- ---------------------------------------------------------------------
-- 14. RENEGOCIACIONES
-- ---------------------------------------------------------------------
CREATE TABLE renegociaciones (
    id_renegociacion    SERIAL PRIMARY KEY,
    id_contrato         INTEGER NOT NULL REFERENCES contratos(id_contrato),
    id_cobro_origen     INTEGER REFERENCES cobros(id_cobro), -- no nulo si vino de un abono a capital
    fecha               DATE NOT NULL DEFAULT CURRENT_DATE,
    motivo              VARCHAR(500) NOT NULL,
    condiciones_anteriores JSONB,
    condiciones_nuevas     JSONB,
    id_usuario_autoriza INTEGER NOT NULL REFERENCES usuarios(id_usuario),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario)
);

CREATE INDEX idx_renegociaciones_contrato ON renegociaciones(id_contrato);

-- La existencia de al menos una fila aquí para un id_contrato es lo que
-- determina la etiqueta derivada "Renegociado" (ver vista es_renegociado
-- en el entregable de vistas SQL).

-- ---------------------------------------------------------------------
-- 15. COMISIONES
-- ---------------------------------------------------------------------
CREATE TABLE comisiones (
    id_comision         SERIAL PRIMARY KEY,
    id_venta            INTEGER NOT NULL REFERENCES ventas(id_venta),
    id_vendedor         INTEGER NOT NULL REFERENCES usuarios(id_usuario),
    porcentaje_o_monto  NUMERIC(10,4) NOT NULL,
    base_incluye_inicial BOOLEAN NOT NULL DEFAULT true,
    monto_comision      NUMERIC(16,2) NOT NULL CHECK (monto_comision >= 0),
    fecha_generacion    DATE NOT NULL DEFAULT CURRENT_DATE,
    fecha_pago          DATE,
    id_usuario_paga     INTEGER REFERENCES usuarios(id_usuario),
    estado              VARCHAR(20) NOT NULL DEFAULT 'Pendiente'
                            CHECK (estado IN ('Pendiente','Pagada')),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario),
    CHECK ( (estado = 'Pagada' AND fecha_pago IS NOT NULL AND id_usuario_paga IS NOT NULL)
         OR (estado = 'Pendiente' AND fecha_pago IS NULL AND id_usuario_paga IS NULL) )
);

CREATE INDEX idx_comisiones_vendedor ON comisiones(id_vendedor);
CREATE INDEX idx_comisiones_estado ON comisiones(estado);

-- ---------------------------------------------------------------------
-- 16. CONFIGURACION
-- ---------------------------------------------------------------------
CREATE TABLE configuracion (
    id_configuracion    SERIAL PRIMARY KEY,
    clave               VARCHAR(60) NOT NULL UNIQUE,
    valor               VARCHAR(255) NOT NULL,
    descripcion         VARCHAR(255),
    estado              VARCHAR(20) NOT NULL DEFAULT 'Activo'
                            CHECK (estado IN ('Activo','Inactivo')),
    fecha_creacion      TIMESTAMP NOT NULL DEFAULT now(),
    fecha_modificacion  TIMESTAMP,
    id_usuario_crea     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_modifica INTEGER REFERENCES usuarios(id_usuario)
);

-- Datos semilla — valores por defecto sugeridos en la sección 6.13
INSERT INTO configuracion (clave, valor, descripcion) VALUES
    ('dias_reserva_default', '15', 'Días de vigencia por defecto de una reserva'),
    ('porcentaje_mora', '0.02', 'Porcentaje de mora, fracción decimal (0.02 = 2%)'),
    ('dias_gracia_mora', '5', 'Días de gracia antes de generar mora'),
    ('impuesto_venta', '0', 'Impuesto sobre venta, fracción decimal'),
    ('formato_numero_recibo', 'REC-000001', 'Formato/plantilla del número de recibo'),
    ('moneda_default', 'DOP', 'Moneda predeterminada del sistema'),
    ('simbolo_moneda', 'RD$', 'Símbolo de la moneda predeterminada'),
    ('requiere_inicial_pagado_para_activar_contrato', 'true', 'Si el contrato requiere el cobro del inicial para activarse'),
    ('comision_incluye_inicial', 'true', 'Si la base de cálculo de comisión incluye el monto inicial');

-- ---------------------------------------------------------------------
-- 17. AUDITORIA
-- ---------------------------------------------------------------------
CREATE TABLE auditoria (
    id_auditoria        BIGSERIAL PRIMARY KEY,
    id_usuario          INTEGER REFERENCES usuarios(id_usuario),
    accion              VARCHAR(100) NOT NULL,
    entidad_afectada    VARCHAR(50) NOT NULL,
    id_entidad_afectada VARCHAR(50) NOT NULL,
    fecha_hora          TIMESTAMP NOT NULL DEFAULT now(),
    detalle             JSONB
);

CREATE INDEX idx_auditoria_entidad ON auditoria(entidad_afectada, id_entidad_afectada);
CREATE INDEX idx_auditoria_fecha ON auditoria(fecha_hora);

-- ---------------------------------------------------------------------
-- 18. DOCUMENTOS_CONTRATO (fuera de alcance de la v1.0 — solo referencia)
-- ---------------------------------------------------------------------
-- CREATE TABLE documentos_contrato (
--     id_documento        SERIAL PRIMARY KEY,
--     id_contrato         INTEGER NOT NULL REFERENCES contratos(id_contrato),
--     nombre_archivo      VARCHAR(255) NOT NULL,
--     ruta_archivo        VARCHAR(500) NOT NULL,
--     tipo_documento      VARCHAR(50),
--     fecha_subida        TIMESTAMP NOT NULL DEFAULT now(),
--     id_usuario_subio    INTEGER NOT NULL REFERENCES usuarios(id_usuario)
-- );

-- ---------------------------------------------------------------------
-- Roles y usuario administrador semilla (ajustar antes de producción)
-- ---------------------------------------------------------------------
INSERT INTO roles (nombre_rol, descripcion) VALUES
    ('Administrador', 'Acceso completo al sistema'),
    ('Vendedor', 'Gestión de clientes, solares y ventas'),
    ('Cajero', 'Registro de cobros y consulta de balances'),
    ('Gerente', 'Consulta de reportes y supervisión general');

-- El password_hash debe generarse con el mecanismo de hashing definido por
-- el backend (bcrypt/argon2, etc.) antes de insertar el usuario real.
-- Este INSERT es solo un placeholder de estructura, no de valor real:
-- INSERT INTO usuarios (id_rol, nombre, correo, nombre_acceso, password_hash)
-- VALUES (1, 'Administrador Inicial', 'admin@empresa.com', 'admin', '<hash_generado_por_la_app>');

COMMIT;

-- =====================================================================
-- Notas para el resto de los entregables técnicos:
-- 1. Vistas SQL pendientes: balance_por_cuota, balance_por_mora,
--    balance_por_contrato, es_renegociado(contrato) — ver sección 15
--    del documento funcional v6.6. No se crean en este script porque
--    dependen de decisiones finales de motor/ORM para su sintaxis exacta.
-- 2. Triggers/lógica transaccional pendientes: bloqueo de solar al
--    insertar venta; activación de contrato + solar a Vendido al
--    registrar cobro tipo Inicial; liberación del solar si la venta se
--    anula antes del inicial; exigir fila en renegociaciones cuando se
--    inserta un detalle_cobro con tipo_aplicacion = 'Abono a capital'.
-- 3. Scheduler diario pendiente: generación de mora (respetando el
--    índice único uq_mora_activa_por_cuota) y actualización de
--    dias_atraso sin tocar monto_mora en registros existentes.
-- =====================================================================

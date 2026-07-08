# Sistema de Administración de Venta de Solares y Cobros

Sistema web para administrar la venta de solares (lotes) de una inmobiliaria: clientes, proyectos, reservas, ventas a plazos, cobros, moras, renegociaciones, comisiones, reportes y auditoría.

## Módulos principales

- **Catálogos** — Clientes, Proyectos, Solares, Reservas.
- **Ventas** — Registro de venta, bloqueo automático del solar, generación de contrato + plan de cuotas + comisión del vendedor.
- **Cobros** — Registro de pagos por tipo (Inicial, Cuota, Mora, Adelanto, Abono a capital), anulación de recibos, recibo imprimible con datos empresariales.
- **Mora** — Generación automática diaria (cargo único, congelado), pago total o parcial, ajuste y anulación con auditoría.
- **Renegociación** — Recalculo formal del plan de cuotas, con snapshot de condiciones anteriores y nuevas.
- **Reportes** — Ventas, Saldados, Cobros, Mora, Comisiones, Solares, Estado de cuenta, Auditoría. Todos con filtros y exportación a CSV.
- **Configuración** — Parámetros del sistema (tasas, días de gracia, comisión) + datos empresariales para el recibo.
- **Auditoría** — Registro completo de operaciones y transiciones automáticas de estado.

## Arquitectura

| Capa | Tecnología |
|---|---|
| Backend | Node.js 20, HTTP nativo, `pg` con pool, transacciones ACID |
| Base de datos | PostgreSQL 16, migraciones versionadas, vistas SQL para cálculo dinámico de balances |
| Seguridad | JWT (Bearer), bcrypt, rate limiting, validación zod, headers CSP/HSTS |
| Frontend | SPA JavaScript vanilla, sin framework |
| Scheduler | Jobs in-process para generación diaria de mora y expiración de reservas |
| Deploy | Docker Compose (app + Postgres) |

## Roles y permisos

- **Administrador** — acceso total al sistema.
- **Gerente** — todos los flujos operativos, incluyendo anulaciones y renegociaciones.
- **Vendedor** — gestión de clientes, reservas y ventas; reportes propios.
- **Cajero** — registro de cobros, consulta de estados de cuenta.

Permisos configurables desde la matriz en `db/migrations/003_permisos_seed.sql`.

## Requisitos

- **Docker** y **Docker Compose** (recomendado).
- Alternativa: Node.js 18+ y PostgreSQL 14+ instalados localmente.

## Despliegue con Docker (recomendado)

```bash
# 1. Clonar
git clone https://github.com/Guitarra2428/sistemaVentaSolaresCobros.git
cd sistemaVentaSolaresCobros

# 2. Configurar variables (mínimo: JWT_SECRET fuerte)
cp .env.example .env
# editar .env

# 3. Levantar
docker compose up -d --build

# 4. Aplicar migraciones y (opcional) datos de prueba
docker compose exec app npm run db:migrate
docker compose exec app npm run db:seed

# 5. Verificar
curl http://localhost:3020/api/health
```

El sistema queda disponible en `http://localhost:3020`.

## Despliegue con Node local (sin Docker)

```bash
# 1. Crear base de datos con un superuser de Postgres
psql -c "CREATE USER solares WITH PASSWORD 'solares123';"
psql -c "CREATE DATABASE venta_solares OWNER solares;"

# 2. Instalar deps y configurar
npm install
cp .env.example .env
# editar DATABASE_URL con la conexión real

# 3. Aplicar migraciones y correr
npm run db:setup   # reset + migrate + seed
npm start
```

## Usuarios semilla (solo desarrollo)

Los siguientes usuarios se crean al ejecutar `db:seed`. **Todos tienen el flag `password_debe_cambiar = true` y se les forzará cambio de contraseña al primer login.**

| Usuario   | Contraseña   | Rol            |
|-----------|--------------|----------------|
| admin     | admin123     | Administrador  |
| gerente   | gerente123   | Gerente        |
| vendedor  | ventas123    | Vendedor       |
| vendedor2 | ventas456    | Vendedor       |
| cajero    | caja123      | Cajero         |
| cajero2   | caja456      | Cajero         |

## Endpoints principales

**Autenticación**
- `POST /api/login` → `{ user, permisos, token }` (JWT 8h)
- `POST /api/cambiar-password`
- `GET /api/health` — público, no requiere token

**Catálogos**
- `GET/POST /api/clientes`, `PUT /api/clientes/:id`
- `GET /api/clientes/:id/detalle` — perfil completo del cliente
- `POST /api/proyectos`, `POST /api/solares`
- `POST /api/solares/:id/bloquear` — bloqueo administrativo/legal
- `GET /api/solares/:id/historial`
- `POST /api/reservas`, `DELETE /api/reservas/:id`

**Ventas y contratos**
- `POST /api/ventas` — bloquea solar, genera contrato + plan
- `DELETE /api/ventas/:id` — anula venta antes del inicial
- `GET /api/estado-cuenta/:idContrato`

**Cobros**
- `POST /api/cobros` — tipos: Inicial, Cuota, Mora, Adelanto, Abono a capital
- `DELETE /api/cobros/:id` — anula recibo con motivo
- `GET /api/cobros/:id/detalle` — recibo imprimible

**Mora**
- `POST /api/mora/generar` — manual (el scheduler diario lo hace automático)
- `PUT /api/mora/:id` — ajustar monto
- `DELETE /api/mora/:id` — anular

**Otros**
- `POST /api/renegociaciones` — recalcula plan de cuotas
- `GET /api/comisiones`, `PUT /api/comisiones/:id/pagar`
- `GET/PATCH /api/configuracion`
- `GET /api/auditoria?entidad=&idEntidad=&idUsuario=&desde=&hasta=&limit=`
- `GET /api/reportes/{ventas,cobros,mora,comisiones,solares}` con filtros
- `GET /api/bootstrap` — snapshot completo para el frontend

## Reglas de negocio garantizadas

- Bloqueo automático del solar al registrar venta (`tipo_bloqueo = 'Venta pendiente de inicial'`).
- Solar pasa a `Vendido` solo cuando el cobro del inicial cubre el monto completo.
- Al anular un cobro Inicial, el contrato vuelve a `Pendiente de inicial` y el solar a `Bloqueado`.
- Mora como cargo único fijo (no acumulativo), congelado al momento de generarse.
- Solo puede existir una mora activa por cuota (constraint SQL).
- Contrato solo pasa a `Saldado` cuando todas las cuotas están Pagadas/Anuladas Y no hay moras activas.
- Balance calculado dinámicamente desde vistas SQL — nunca se almacena como campo editable.
- Transiciones automáticas de estado (cuota, mora, contrato) quedan registradas en auditoría.
- Doble-submit prevenido en el frontend con lock por endpoint.

## Seguridad

- Contraseñas cifradas con bcrypt (10 rondas).
- JWT con expiración configurable (default 8h).
- Rate limiting en endpoints sensibles: `/api/login` (8/min), `/api/ventas` (30/min), `/api/cobros` (60/min), `/api/mora/generar` (5/min).
- Validación de payload con zod en todos los endpoints de mutación.
- Headers de seguridad: `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, CSP básica.
- `Strict-Transport-Security` (HSTS) cuando `NODE_ENV=production`.
- CORS restringible por variable `CORS_ORIGINS`.

## Backups

Script incluido para respaldo diario:

```bash
./scripts/backup.sh          # genera backups/venta_solares-YYYYMMDD-HHMMSS.sql.gz
./scripts/backup.sh /ruta    # destino personalizado
```

Rotación automática de backups mayores a 30 días.

Restore:

```bash
./scripts/restore.sh backups/venta_solares-YYYYMMDD-HHMMSS.sql.gz
```

Para producción, agrégalos al cron del host:

```
0 3 * * *  /ruta/proyecto/scripts/backup.sh
```

## Variables de entorno

| Variable | Descripción | Default |
|---|---|---|
| `PORT` | Puerto HTTP | `3020` |
| `NODE_ENV` | `development` o `production` | `development` |
| `DATABASE_URL` | Cadena de conexión Postgres | (obligatorio) |
| `JWT_SECRET` | Secreto para firmar tokens (≥ 32 chars) | (obligatorio) |
| `JWT_EXPIRES_IN` | Duración del token | `8h` |
| `BCRYPT_ROUNDS` | Rondas bcrypt | `10` |
| `LOG_LEVEL` | `debug`, `info`, `warn`, `error` | `info` |
| `CORS_ORIGINS` | Lista separada por coma; vacío = solo mismo origen | `` |
| `LATE_FEE_JOB_TIME` | Hora del scheduler diario (`HH:mm`) | `02:00` |
| `PG_POOL_MAX` | Máximo de conexiones en el pool | `10` |

## Estructura del código

```
public/                    SPA vanilla (app.js, styles.css, index.html)
src/
  config/                  env, paths
  controllers/             adapters HTTP → services
  db/                      pool + helpers
  middleware/              rate limit, headers de seguridad
  routes/                  apiRouter con matching :params
  scheduler/               jobs diarios (mora, expiración de reservas)
  services/                lógica de negocio + queries SQL
  validation/              schemas zod
  utils/                   date, format, hash, http, case
  views/                   servidor de estáticos
  errors.js                clases de error tipadas
  logger.js                pino
db/migrations/             SQL versionado (schema_migrations lleva registro)
scripts/                   migrate, reset, seed, smoke, backup, restore
```

## Testing

Suite de smoke tests end-to-end que verifica el flujo completo:

```bash
docker compose exec app npm run smoke
# o localmente:
npm run smoke
```

Cubre: login, permisos, creación de venta, cobro inicial, activación de contrato, reportes, rate limiting, auditoría.

## Antes de producción

1. **Cambiar `JWT_SECRET`** por uno fuerte: `openssl rand -base64 48`
2. **Cambiar contraseñas** de los usuarios semilla (o eliminarlos).
3. **Configurar datos empresariales** desde el panel de Configuración (nombre, RNC, dirección, teléfono, nota legal del recibo).
4. **Servir tras HTTPS** con nginx/Caddy + Let's Encrypt.
5. **Configurar `CORS_ORIGINS`** si el frontend vive en otro dominio.
6. **Programar backup diario** en cron.
7. **`NODE_ENV=production`** para logs JSON y HSTS.
8. **Correr smoke test** contra la instancia final.

## Licencia

Uso privado.

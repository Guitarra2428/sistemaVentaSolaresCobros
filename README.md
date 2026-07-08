# Sistema de Administración de Venta de Solares y Cobros

Backend Node.js sobre PostgreSQL 16 + frontend SPA vanilla. Implementación de la
especificación funcional v6.6.

## Arquitectura

- **Backend:** Node 18+, HTTP nativo (sin framework), pool `pg`, transacciones
  ACID, autenticación JWT, hashing bcrypt.
- **Base de datos:** PostgreSQL 14+. Schema aplicado por migraciones versionadas
  (`db/migrations/*.sql`). Vistas de balance (`v_balance_cuota`, `v_balance_mora`,
  `v_balance_contrato`) implementan la lógica de spec §15 sin campos calculados
  editables.
- **Frontend:** HTML+JS vanilla en `public/`. Consume la misma API, guarda token
  JWT en `localStorage`.
- **Scheduler:** job diario in-process para generar mora congelada (spec §6.11).

## Requisitos

- Node.js 18 o superior.
- PostgreSQL 14+ accesible.
- npm.

## Setup local

1. Copia el archivo de variables y ajústalo:

   ```
   cp .env.example .env
   ```

   Variables mínimas:
   - `DATABASE_URL` — cadena de conexión Postgres (ej: `postgres://user:pass@host:5432/db`).
   - `JWT_SECRET` — secreto para firmar tokens (mínimo 32 caracteres).
   - `PORT` — puerto HTTP del servidor (por defecto `3020`).

2. Instala dependencias:

   ```
   npm install
   ```

3. Crea la base de datos y el usuario (una sola vez, con un superuser):

   ```
   CREATE USER solares WITH PASSWORD 'solares123';
   CREATE DATABASE venta_solares OWNER solares;
   GRANT ALL PRIVILEGES ON DATABASE venta_solares TO solares;
   ```

4. Aplica migraciones y (opcional) datos de prueba:

   ```
   npm run db:setup        # reset + migrate + seed
   npm run db:migrate      # solo migrar
   npm run db:seed         # solo seed
   ```

5. Arranca el servidor:

   ```
   npm start               # producción
   npm run dev             # con --watch para desarrollo
   ```

6. Abre `http://localhost:3020` en el navegador.

## Usuarios semilla (dev)

Todos hashed con bcrypt en `usuarios.password_hash`.

| Usuario   | Password    | Rol            |
|-----------|-------------|----------------|
| admin     | admin123    | Administrador  |
| vendedor  | ventas123   | Vendedor       |
| cajero    | caja123     | Cajero         |
| gerente   | gerente123  | Gerente        |

**Cambia estas contraseñas antes de subir a producción.**

## Endpoints principales

Autenticación:
- `POST /api/login` — devuelve `{ user, permisos, token }` (JWT 8h).
- Todos los demás endpoints exigen `Authorization: Bearer <token>`.

Catálogos y flujo:
- `GET/POST /api/clientes`, `PUT /api/clientes/:id`
- `POST /api/proyectos`
- `POST /api/solares`
- `POST /api/reservas`
- `POST /api/ventas` → bloquea solar, genera contrato + plan.
- `DELETE /api/ventas/:id` → anula venta antes del inicial y libera solar.
- `POST /api/cobros` → tipos: `Inicial`, `Cuota`, `Mora`, `Adelanto`, `Abono a capital`.
- `DELETE /api/cobros/:id` → anula recibo (motivo obligatorio).
- `POST /api/renegociaciones` → renegociación formal (recalcula plan).
- `POST /api/mora/generar` → genera mora manualmente (el scheduler lo hace diario).
- `PUT /api/mora/:id` → ajusta monto de una mora.
- `DELETE /api/mora/:id` → anula una mora.

Reportes:
- `GET /api/reportes/ventas`
- `GET /api/reportes/cobros`
- `GET /api/reportes/mora`
- `GET /api/reportes/comisiones`
- `GET /api/reportes/solares`
- `GET /api/estado-cuenta/:idContrato`

Otros:
- `GET/PATCH /api/configuracion` — parámetros del sistema.
- `GET /api/auditoria?entidad=&idEntidad=&limit=` — bitácora.
- `GET /api/bootstrap` — snapshot completo para el frontend.

## Reglas de negocio críticas implementadas

- Bloqueo automático de solar al registrar venta (`tipo_bloqueo = 'Venta pendiente de inicial'`).
- Solar pasa a `Vendido` solo cuando el cobro del inicial cubre `venta.monto_inicial`.
- Mora como cargo único fijo con período de gracia configurable, con soporte de pagos parciales.
- Abono a capital dispara registro obligatorio en `renegociaciones`.
- Balance calculado dinámicamente desde vistas SQL (nunca almacenado).
- Matriz de permisos por rol enforced en `authService.requirePermission`.
- Anulación de venta antes del inicial libera el solar.
- Constraint `uq_mora_activa_por_cuota` impide dos moras activas simultáneas.

## Despliegue en producción

1. Sirve tras HTTPS (nginx/Caddy). Nunca expongas HTTP directo.
2. Genera un `JWT_SECRET` fuerte (`openssl rand -base64 48`).
3. `NODE_ENV=production` habilita HSTS y desactiva pretty-print de logs.
4. Rota los usuarios semilla o desactívalos.
5. Configura backup diario con `pg_dump`:

   ```
   pg_dump "$DATABASE_URL" | gzip > backup-$(date +%F).sql.gz
   ```

6. Ejecuta el smoke test contra la instancia:

   ```
   npm run smoke
   ```

7. Configura `CORS_ORIGINS` si sirves el frontend en otro dominio.
8. Monitorea logs (`pino` emite JSON en producción — apto para Loki/CloudWatch).
9. El scheduler de mora se ejecuta a la hora indicada por `LATE_FEE_JOB_TIME` (formato `HH:mm`, default `02:00`).

## Estructura del código

```
src/
  config/         env, paths
  controllers/    thin adapters HTTP → services
  db/             pool + helpers
  middleware/     rate limit, seguridad
  routes/         apiRouter con matching :params
  scheduler/      jobs periódicos
  services/       lógica de negocio + queries SQL
  validation/     schemas zod
  utils/          date, format, hash, http
  views/          static file server
  errors.js       clases de error tipadas
  logger.js       pino
db/migrations/    SQL versionado (versión aplicada trackeada en schema_migrations)
scripts/          migrate.js, reset.js, seed.js, smoke.js
public/           SPA vanilla
```

## Fuera del alcance de la v1.0

(según spec §18)

- Pasarela de pago en línea, firma electrónica, notificaciones automáticas.
- Portal de autoconsulta para clientes.
- Múltiples monedas simultáneas.
- Mora diaria acumulativa (v1.0 solo mora congelada única).
- Integración contable externa.

## Licencia

UNLICENSED — uso privado.

#!/usr/bin/env bash
# Restore de un backup .sql.gz a la BD del container solares-db. DESTRUCTIVO.
# Uso: ./scripts/restore.sh backups/venta_solares-YYYYMMDD-HHMMSS.sql.gz
set -euo pipefail

if [ -z "${1:-}" ]; then
  echo "Uso: $0 <archivo.sql.gz>" >&2
  exit 2
fi
FILE="$1"
if [ ! -f "$FILE" ]; then
  echo "ERROR: archivo no encontrado: $FILE" >&2
  exit 2
fi

if [ -f "$(dirname "$0")/../.env" ]; then
  set -a; . "$(dirname "$0")/../.env"; set +a
fi
DB_NAME="${POSTGRES_DB:-venta_solares}"
DB_USER="${POSTGRES_USER:-solares}"

echo "ATENCIÓN: Se va a RESTAURAR $FILE sobre $DB_NAME. Esto borra toda la data actual."
read -p "Escribe 'SI' para continuar: " CONFIRM
if [ "$CONFIRM" != "SI" ]; then
  echo "Cancelado."
  exit 1
fi

echo "Dropeando schema public..."
docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"

echo "Restaurando desde $FILE ..."
gunzip -c "$FILE" | docker compose exec -T db psql -U "$DB_USER" -d "$DB_NAME"

echo "OK. Verifica con: docker compose exec db psql -U $DB_USER -d $DB_NAME -c 'SELECT count(*) FROM usuarios;'"

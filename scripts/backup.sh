#!/usr/bin/env bash
# Backup de la BD del sistema. Se ejecuta DESDE EL HOST usando pg_dump del container solares-db.
# Uso desde la carpeta del proyecto:
#   ./scripts/backup.sh
# O con directorio destino explícito:
#   ./scripts/backup.sh /ruta/backups
set -euo pipefail

DEST="${1:-$(dirname "$0")/../backups}"
mkdir -p "$DEST"

STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$DEST/venta_solares-$STAMP.sql.gz"

# Cargamos el .env sólo para leer POSTGRES_DB / POSTGRES_USER (defaults del compose)
if [ -f "$(dirname "$0")/../.env" ]; then
  set -a; . "$(dirname "$0")/../.env"; set +a
fi
DB_NAME="${POSTGRES_DB:-venta_solares}"
DB_USER="${POSTGRES_USER:-solares}"

echo "Respaldando $DB_NAME desde container solares-db a $FILE ..."
docker compose exec -T db pg_dump --no-owner --no-privileges -U "$DB_USER" "$DB_NAME" | gzip -9 > "$FILE"

SIZE=$(du -h "$FILE" | cut -f1)
echo "Backup creado: $FILE ($SIZE)"

DELETED=$(find "$DEST" -name "venta_solares-*.sql.gz" -mtime +30 -type f -print -delete 2>/dev/null | wc -l)
if [ "$DELETED" -gt 0 ]; then
  echo "Rotados $DELETED backup(s) antiguo(s)."
fi

echo "OK."

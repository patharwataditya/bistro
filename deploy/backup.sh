#!/bin/bash
# Nightly logical backup of the Bistro database, kept for 7 days (installed as a cron job by
# setup-server.sh). A failed or empty dump is never kept as if it were good.
#
# Restore (on the server, from deploy/):
#   docker compose --env-file .env.prod -f docker-compose.prod.yml stop api
#   docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db dropdb -U bistro bistro
#   docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db createdb -U bistro bistro
#   gunzip -c /var/backups/bistro/<file>.sql.gz | docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db psql -U bistro -v ON_ERROR_STOP=1 bistro
#   docker compose --env-file .env.prod -f docker-compose.prod.yml start api
set -euo pipefail
umask 077
DIR=/var/backups/bistro
mkdir -p "$DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
PART="$DIR/bistro-$STAMP.sql.gz.part"
cd "$(dirname "$0")"
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db \
  pg_dump -U bistro --format=plain --no-owner bistro | gzip -9 > "$PART"
gzip -t "$PART"
if [ "$(gunzip -c "$PART" | head -c 1000 | wc -c)" -lt 1000 ]; then
  echo "backup too small; keeping previous backups" >&2
  rm -f "$PART"
  exit 1
fi
mv "$PART" "$DIR/bistro-$STAMP.sql.gz"
find "$DIR" -name 'bistro-*.sql.gz' -mtime +7 -delete
echo "backup ok: bistro-$STAMP.sql.gz"

#!/bin/sh
# Nightly logical backup of the Bistro database, kept for 7 days. Installed as a cron job by
# setup-server.sh. Restore with: gunzip -c FILE | docker compose exec -T db psql -U bistro bistro
set -eu
DIR=/var/backups/bistro
mkdir -p "$DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
cd "$(dirname "$0")"
docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db \
  pg_dump -U bistro --format=plain --no-owner bistro | gzip -9 > "$DIR/bistro-$STAMP.sql.gz.part"
mv "$DIR/bistro-$STAMP.sql.gz.part" "$DIR/bistro-$STAMP.sql.gz"
chmod 600 "$DIR/bistro-$STAMP.sql.gz"
find "$DIR" -name 'bistro-*.sql.gz' -mtime +7 -delete

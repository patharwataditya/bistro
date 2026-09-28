#!/bin/sh
set -eu
# Schema first, then reference data, then serve. A failed migration stops the container
# rather than serving against a half-migrated database.
alembic upgrade head
python -m app.cli sync
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 \
  --workers "${BISTRO_WORKERS:-2}" \
  --proxy-headers --forwarded-allow-ips "${BISTRO_TRUSTED_PROXIES:-127.0.0.1}" \
  --no-server-header --timeout-keep-alive 15

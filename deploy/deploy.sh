#!/bin/bash
# Ship the current backend and web app to the EC2 host with zero config drift:
# build the web app here → rsync code + static files → rebuild the API image on the host →
# compose up (migrations run on container start). Node never runs on the server.
set -euo pipefail
cd "$(dirname "$0")/.."
IP=$(cat deploy/state/ip)
DOMAIN=$(cat deploy/state/domain)
SSH=(ssh -i "$HOME/.ssh/bistro-key.pem" "ubuntu@$IP")
RSYNC_SSH="ssh -i $HOME/.ssh/bistro-key.pem"

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node 22+ is needed to build the web app (see web/.nvmrc)" >&2
  exit 1
fi
(cd web && npm ci --no-audit --no-fund --silent && npm run build --silent)
rsync -az --delete -e "ssh -i $HOME/.ssh/bistro-key.pem" \
  --exclude .venv --exclude __pycache__ --exclude .pytest_cache --exclude .mypy_cache \
  --exclude .ruff_cache --exclude tests --exclude .env backend "ubuntu@$IP:~/bistro/"
rsync -az -e "ssh -i $HOME/.ssh/bistro-key.pem" --exclude state --exclude provision.sh --exclude deploy.sh \
  deploy/ "ubuntu@$IP:~/bistro/deploy/"
# Hashed bundles first and never deleted immediately: a tab still running the previous build
# can finish loading its chunks. index.html goes last, so it only ever points at files present.
# (A directory Docker created as root on an older setup is handed back to ubuntu first.)
"${SSH[@]}" "sudo mkdir -p ~/bistro/web-dist/assets && sudo chown -R ubuntu: ~/bistro/web-dist"
WEB_RSYNC=(rsync -az --chmod=D755,F644 -e "$RSYNC_SSH")  # readable by Caddy whatever the local umask
"${WEB_RSYNC[@]}" web/dist/assets/ "ubuntu@$IP:~/bistro/web-dist/assets/"
"${WEB_RSYNC[@]}" --delete --exclude assets --exclude index.html web/dist/ "ubuntu@$IP:~/bistro/web-dist/"
"${WEB_RSYNC[@]}" web/dist/index.html "ubuntu@$IP:~/bistro/web-dist/index.html"
"${SSH[@]}" "find ~/bistro/web-dist/assets -type f -mtime +14 -delete"
# --pull: base images (Python, Postgres, Caddy) pick up upstream security fixes on each deploy.
"${SSH[@]}" "set -eo pipefail; cd ~/bistro/deploy && C='sudo docker compose --env-file .env.prod -f docker-compose.prod.yml' && \$C pull --quiet db caddy && \$C build --pull 2>&1 | tail -1 && \$C up -d 2>&1 | tail -3 && \$C exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>&1 | tail -1 && sudo docker image prune -f >/dev/null"
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 "https://$DOMAIN/api/v1/health" >/dev/null; then
    echo "healthy: https://$DOMAIN"
    exit 0
  fi
  sleep 3
done
echo "API did not become healthy" >&2
exit 1

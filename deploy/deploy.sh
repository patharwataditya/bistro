#!/bin/bash
# Ship the current backend to the EC2 host and restart the API with zero config drift:
# rsync code → rebuild image on the host → compose up (migrations run on container start).
set -euo pipefail
cd "$(dirname "$0")/.."
IP=$(cat deploy/state/ip)
DOMAIN=$(cat deploy/state/domain)
SSH=(ssh -i "$HOME/.ssh/bistro-key.pem" "ubuntu@$IP")
rsync -az --delete -e "ssh -i $HOME/.ssh/bistro-key.pem" \
  --exclude .venv --exclude __pycache__ --exclude .pytest_cache --exclude .mypy_cache \
  --exclude .ruff_cache --exclude tests --exclude .env backend "ubuntu@$IP:~/bistro/"
rsync -az -e "ssh -i $HOME/.ssh/bistro-key.pem" --exclude state --exclude provision.sh --exclude deploy.sh \
  deploy/ "ubuntu@$IP:~/bistro/deploy/"
"${SSH[@]}" "cd ~/bistro/deploy && sudo docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build 2>&1 | tail -3 && sudo docker image prune -f >/dev/null"
for i in $(seq 1 30); do
  if curl -fsS --max-time 5 "https://$DOMAIN/api/v1/health" >/dev/null; then
    echo "healthy: https://$DOMAIN"
    exit 0
  fi
  sleep 3
done
echo "API did not become healthy" >&2
exit 1

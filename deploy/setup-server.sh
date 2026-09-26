#!/bin/bash
# Runs ON the EC2 instance (Ubuntu 24.04, arm64) as the ubuntu user. Idempotent.
set -euo pipefail
cd "$(dirname "$0")"

# 1 GiB swap: headroom for image builds and bursts on a 2 GiB instance.
if ! swapon --show | grep -q /swapfile; then
  sudo fallocate -l 1G /swapfile && sudo chmod 600 /swapfile
  sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-bistro.conf >/dev/null && sudo sysctl -p /etc/sysctl.d/99-bistro.conf
fi

if ! command -v docker >/dev/null; then
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
  sudo apt-get update -qq
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  sudo usermod -aG docker ubuntu
fi
sudo systemctl enable --now docker

# Unattended security updates, rebooting at a quiet hour when a kernel update needs it.
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq unattended-upgrades >/dev/null
printf 'Unattended-Upgrade::Automatic-Reboot "true";\nUnattended-Upgrade::Automatic-Reboot-Time "04:45";\n' \
  | sudo tee /etc/apt/apt.conf.d/52bistro-reboot >/dev/null

# Secrets are generated here, on the server, and never leave it.
if [ ! -f .env.prod ]; then
  umask 077
  {
    echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)"
    echo "BISTRO_JWT_SECRET=$(openssl rand -hex 48)"
    echo "BISTRO_DOMAIN=${BISTRO_DOMAIN:?export BISTRO_DOMAIN first}"
  } > .env.prod
fi

sudo docker compose --env-file .env.prod -f docker-compose.prod.yml pull --quiet db caddy
sudo docker compose --env-file .env.prod -f docker-compose.prod.yml build --pull
sudo docker compose --env-file .env.prod -f docker-compose.prod.yml up -d

chmod +x backup.sh
install_cron() {  # $1 = marker, $2 = line; replaces any previous line with the marker
  { sudo crontab -l 2>/dev/null || true; } | { grep -v "$1" || true; } > /tmp/bistro-cron
  echo "$2 # $1" >> /tmp/bistro-cron
  sudo crontab /tmp/bistro-cron && rm -f /tmp/bistro-cron
}
install_cron bistro-backup "30 3 * * * $(pwd)/backup.sh >> /var/log/bistro-backup.log 2>&1"
install_cron bistro-purge "15 4 * * * cd $(pwd) && docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T api python -m app.cli purge-idempotency >> /var/log/bistro-purge.log 2>&1"
echo "setup complete"

#!/usr/bin/env bash
# Run ON the VM once (as a sudo-capable user). Lays out /opt/math-sprout and starts the stack.
# Prerequisite: Docker Engine + compose plugin present on the VM (Debian/Ubuntu: apt package `docker.io`
# and `docker-compose-v2`, or your distro's equivalent). The script does not install Docker itself.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/YoungApple/math-sprout/main/deploy/vm/install.sh \
#     | DOMAIN=math.watchparty.cn bash
set -euo pipefail
DOMAIN="${DOMAIN:-math.watchparty.cn}"
DIR=/opt/math-sprout
REPO_RAW="https://raw.githubusercontent.com/YoungApple/math-sprout/main/deploy/vm"

command -v docker >/dev/null || { echo "docker not found; install Docker Engine + compose plugin first"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin not found"; exit 1; }

sudo mkdir -p "$DIR/data" && sudo chown -R "$USER" "$DIR"
cd "$DIR"
for f in docker-compose.yml Caddyfile update.sh backup.sh; do curl -fsSLo "$f" "$REPO_RAW/$f"; done
chmod +x update.sh backup.sh
[ -f .env ] || cat > .env <<ENV
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
FAMILY_PASSCODE=
DOMAIN=$DOMAIN
ENV
chmod 600 .env

# Open 80/443 on the host firewall if ufw is active (GCP VPC firewall must also allow them).
if command -v ufw >/dev/null && sudo ufw status | grep -q "Status: active"; then
  sudo ufw allow 80/tcp && sudo ufw allow 443/tcp
fi

echo
echo "1) Edit $DIR/.env  (GEMINI_API_KEY, FAMILY_PASSCODE)"
echo "2) cd $DIR && docker compose up -d"
echo "3) Make sure DNS A record $DOMAIN -> this VM's public IP exists; Caddy will fetch the certificate automatically."

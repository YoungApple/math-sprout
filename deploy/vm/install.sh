#!/usr/bin/env bash
# One-shot installer. Run ON the VM (Debian/Ubuntu, sudo-capable user):
#
#   curl -fsSL https://raw.githubusercontent.com/YoungApple/math-sprout/main/deploy/vm/install.sh \
#     | GEMINI_API_KEY=<key> FAMILY_PASSCODE=<code> DOMAIN=math.watchparty.cn bash
#
# What it does: installs Docker from the distro repos if missing, lays out /opt/math-sprout,
# writes .env from the variables above, opens 80/443 in ufw if active, and starts the stack.
# Re-running is safe; existing .env values are kept unless new ones are passed.
set -euo pipefail
DOMAIN="${DOMAIN:-math.watchparty.cn}"
DIR=/opt/math-sprout
REPO_RAW="https://raw.githubusercontent.com/YoungApple/math-sprout/main/deploy/vm"
SUDO=""; [ "$(id -u)" -ne 0 ] && SUDO="sudo"

if ! command -v docker >/dev/null 2>&1; then
  echo "==> Installing Docker Engine + compose plugin from distro packages"
  if command -v apt-get >/dev/null; then
    $SUDO apt-get update -qq
    $SUDO apt-get install -y -qq docker.io docker-compose-v2 curl >/dev/null || $SUDO apt-get install -y -qq docker.io docker-compose-plugin curl >/dev/null
  elif command -v dnf >/dev/null; then
    $SUDO dnf install -y docker docker-compose-plugin
  else
    echo "Unsupported distro: install Docker Engine + compose plugin manually, then re-run."; exit 1
  fi
  $SUDO systemctl enable --now docker
  $SUDO usermod -aG docker "$USER" || true
fi
docker compose version >/dev/null 2>&1 || { echo "docker compose plugin missing (try: sudo apt-get install docker-compose-v2)"; exit 1; }

$SUDO mkdir -p "$DIR/data" "$DIR/backups" && $SUDO chown -R "$USER" "$DIR"
$SUDO chown -R 10001:10001 "$DIR/data"   # uid of the non-root user inside the app image
cd "$DIR"
for f in docker-compose.yml Caddyfile update.sh backup.sh; do curl -fsSLo "$f" "$REPO_RAW/$f"; done
chmod +x update.sh backup.sh

# .env: create or update only the keys that were passed in (safe for &, |, \ in secrets).
touch .env; chmod 600 .env
setkv() {
  local tmp
  tmp=$(mktemp)
  grep -v "^$1=" .env > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" .env
}
setkv DOMAIN "$DOMAIN"
grep -q "^GEMINI_MODEL=" .env || setkv GEMINI_MODEL "gemini-3.5-flash,gemini-flash-latest,gemini-flash-lite-latest,gemini-2.5-flash-lite"
[ -n "${GEMINI_API_KEY:-}" ] && setkv GEMINI_API_KEY "$GEMINI_API_KEY"
[ -n "${FAMILY_PASSCODE:-}" ] && setkv FAMILY_PASSCODE "$FAMILY_PASSCODE"

if command -v ufw >/dev/null && $SUDO ufw status 2>/dev/null | grep -q "Status: active"; then
  $SUDO ufw allow 80/tcp >/dev/null && $SUDO ufw allow 443/tcp >/dev/null
fi

# Nightly backup at 03:00 if not already scheduled.
( crontab -l 2>/dev/null | grep -q "$DIR/backup.sh" ) || ( crontab -l 2>/dev/null; echo "0 3 * * * $DIR/backup.sh >> $DIR/backup.log 2>&1" ) | crontab -

if grep -q "^GEMINI_API_KEY=.\+" .env; then
  echo "==> Starting stack"
  $SUDO docker compose pull app
  $SUDO docker compose up -d
  sleep 5
  $SUDO docker compose ps
  echo
  echo "✅ Up. Caddy is requesting the certificate for https://$DOMAIN (needs DNS A record -> this VM, ports 80/443 open)."
  echo "   Logs: cd $DIR && sudo docker compose logs -f caddy app"
else
  echo "⚠️  GEMINI_API_KEY not set. Edit $DIR/.env then run: cd $DIR && sudo docker compose up -d"
fi

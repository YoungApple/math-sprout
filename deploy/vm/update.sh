#!/usr/bin/env bash
# Run ON the VM to roll out the latest image (also invoked by the GitHub Actions deploy job over SSH).
set -euo pipefail
cd /opt/math-sprout
docker compose pull app
docker compose up -d
docker image prune -f >/dev/null
sleep 3
curl -fsS -o /dev/null -w "health=%{http_code}\n" "https://${DOMAIN:-math.watchparty.cn}/api/mistakes" || true

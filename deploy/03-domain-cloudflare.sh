#!/usr/bin/env bash
# Free path to a mainland-reachable custom domain:
#   Cloudflare (free plan) Worker reverse proxy -> Cloud Run *.run.app
#
# Prerequisites (one-time, in the Cloudflare dashboard):
#   1. Add your domain to Cloudflare (Free plan) and switch its nameservers at 阿里云/DNSPod
#      to the two Cloudflare nameservers shown. (CNAME-only setup is a paid feature.)
#   2. DNS: add a proxied (orange cloud) record so the hostname exists:
#        Type AAAA   Name math   Content 100::   Proxy ON
#   3. SSL/TLS mode: Full.
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$(dirname "$0")/cloudflare-proxy"

ORIGIN=$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')
ZONE="${DOMAIN#*.}"
sed -i.bak \
  -e "s|^ORIGIN = .*|ORIGIN = \"$ORIGIN\"|" \
  -e "s|pattern = \"[^\"]*\"|pattern = \"$DOMAIN/*\"|" \
  -e "s|zone_name = \"[^\"]*\"|zone_name = \"$ZONE\"|" wrangler.toml
rm -f wrangler.toml.bak

# wrangler will open a browser for Cloudflare login on first use.
npx --yes wrangler@latest deploy
echo "✅ https://$DOMAIN now proxies to $ORIGIN"

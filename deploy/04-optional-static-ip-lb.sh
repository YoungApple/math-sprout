#!/usr/bin/env bash
# OPTIONAL PAID UPGRADE (~\$18/month for the forwarding rule).
# Use only if the free Cloudflare Worker proxy (03-domain-cloudflare.sh) proves unreliable from your ISP.
#
# Expose Cloud Run behind a Global External Application Load Balancer with a reserved
# static IPv4 + Google-managed certificate, then point an A record at it.
#
# Why an LB instead of `gcloud run domain-mappings`? Domain mappings resolve to
# ghs.googlehosted.com, which is blocked from mainland China. A customer-owned LB IP is not.
set -euo pipefail
source "$(dirname "$0")/env.sh"
P=(--project "$PROJECT_ID")

gcloud compute addresses create "$SERVICE-ip" --global --ip-version=IPV4 "${P[@]}" 2>/dev/null || true
IP=$(gcloud compute addresses describe "$SERVICE-ip" --global --format='value(address)' "${P[@]}")

gcloud compute network-endpoint-groups create "$SERVICE-neg" --region "$REGION" \
  --network-endpoint-type=serverless --cloud-run-service="$SERVICE" "${P[@]}" 2>/dev/null || true
gcloud compute backend-services create "$SERVICE-backend" --global --load-balancing-scheme=EXTERNAL_MANAGED "${P[@]}" 2>/dev/null || true
gcloud compute backend-services add-backend "$SERVICE-backend" --global \
  --network-endpoint-group="$SERVICE-neg" --network-endpoint-group-region="$REGION" "${P[@]}" 2>/dev/null || true
gcloud compute url-maps create "$SERVICE-urlmap" --default-service "$SERVICE-backend" "${P[@]}" 2>/dev/null || true
gcloud compute ssl-certificates create "$SERVICE-cert" --domains "$DOMAIN" --global "${P[@]}" 2>/dev/null || true
gcloud compute target-https-proxies create "$SERVICE-https-proxy" --url-map "$SERVICE-urlmap" --ssl-certificates "$SERVICE-cert" "${P[@]}" 2>/dev/null || true
gcloud compute forwarding-rules create "$SERVICE-https" --global --load-balancing-scheme=EXTERNAL_MANAGED \
  --address "$SERVICE-ip" --target-https-proxy "$SERVICE-https-proxy" --ports 443 "${P[@]}" 2>/dev/null || true

# HTTP -> HTTPS redirect
cat > /tmp/$SERVICE-redirect.yaml <<YAML
name: $SERVICE-redirect
defaultUrlRedirect:
  httpsRedirect: true
  redirectResponseCode: MOVED_PERMANENTLY_DEFAULT
YAML
gcloud compute url-maps import "$SERVICE-redirect" --global --source /tmp/$SERVICE-redirect.yaml --quiet "${P[@]}" 2>/dev/null || true
gcloud compute target-http-proxies create "$SERVICE-http-proxy" --url-map "$SERVICE-redirect" "${P[@]}" 2>/dev/null || true
gcloud compute forwarding-rules create "$SERVICE-http" --global --load-balancing-scheme=EXTERNAL_MANAGED \
  --address "$SERVICE-ip" --target-http-proxy "$SERVICE-http-proxy" --ports 80 "${P[@]}" 2>/dev/null || true

# Optional hardening: only let the LB reach the service (not the public *.run.app URL).
gcloud run services update "$SERVICE" --region "$REGION" --ingress internal-and-cloud-load-balancing "${P[@]}" >/dev/null

cat <<MSG

✅ Load balancer created. Now add this DNS record at your registrar (阿里云 / DNSPod):

    Type: A    Host: ${DOMAIN%%.*}    Value: $IP    TTL: 600

The Google-managed certificate becomes ACTIVE 10-60 min after DNS propagates:
    gcloud compute ssl-certificates describe $SERVICE-cert --global --format='value(managed.status)'
Then open https://$DOMAIN
MSG

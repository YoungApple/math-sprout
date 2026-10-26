#!/usr/bin/env bash
# Build with Cloud Build and deploy to Cloud Run. Re-run on every release.
set -euo pipefail
source "$(dirname "$0")/env.sh"
cd "$(dirname "$0")/.."

SA="$SERVICE-sa@$PROJECT_ID.iam.gserviceaccount.com"
SECRETS="GEMINI_API_KEY=gemini-api-key:latest"
for pair in DATABASE_URL=database-url DATABASE_AUTH_TOKEN=database-auth-token FAMILY_PASSCODE=family-passcode; do
  name="${pair#*=}"
  gcloud secrets describe "$name" --project "$PROJECT_ID" >/dev/null 2>&1 && SECRETS="$SECRETS,${pair%%=*}=$name:latest"
done

gcloud run deploy "$SERVICE" \
  --project "$PROJECT_ID" --region "$REGION" \
  --source . \
  --service-account "$SA" \
  --allow-unauthenticated \
  --port 8080 --memory 1Gi --cpu 1 --timeout 300 \
  --min-instances 0 --max-instances 3 \
  --set-env-vars "GCS_BUCKET=$BUCKET,GEMINI_MODEL=gemini-2.5-flash" \
  --set-secrets "$SECRETS"

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT_ID" --region "$REGION" --format='value(status.url)')
echo "✅ Deployed: $URL"

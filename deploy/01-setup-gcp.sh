#!/usr/bin/env bash
# One-time project bootstrap: APIs, image bucket, secrets, service account permissions.
set -euo pipefail
source "$(dirname "$0")/env.sh"

gcloud config set project "$PROJECT_ID"
gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com \
  secretmanager.googleapis.com storage.googleapis.com compute.googleapis.com certificatemanager.googleapis.com

# Private bucket for photos (served via signed URLs). Uniform access + 1-year lifecycle is a sane default.
gcloud storage buckets create "gs://$BUCKET" --location="$BUCKET_LOCATION" --uniform-bucket-level-access || true

# Secrets: paste values when prompted.
for s in gemini-api-key database-url database-auth-token family-passcode; do
  gcloud secrets describe "$s" >/dev/null 2>&1 || {
    read -r -s -p "Value for secret '$s' (leave empty to skip): " v; echo
    if [ -n "$v" ]; then printf '%s' "$v" | gcloud secrets create "$s" --data-file=-; fi
  }
done

# Dedicated runtime service account with least privilege.
SA="$SERVICE-sa@$PROJECT_ID.iam.gserviceaccount.com"
gcloud iam service-accounts describe "$SA" >/dev/null 2>&1 || gcloud iam service-accounts create "$SERVICE-sa" --display-name="$SERVICE runtime"
gcloud storage buckets add-iam-policy-binding "gs://$BUCKET" --member="serviceAccount:$SA" --role=roles/storage.objectAdmin >/dev/null
gcloud projects add-iam-policy-binding "$PROJECT_ID" --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor >/dev/null
# Lets the service sign URLs if you ever switch back to direct GCS links.
gcloud iam service-accounts add-iam-policy-binding "$SA" --member="serviceAccount:$SA" --role=roles/iam.serviceAccountTokenCreator >/dev/null

# Keep only the 2 newest container images so Artifact Registry stays within the 0.5 GB free tier.
# (The repository is created by the first `gcloud run deploy --source`; re-run this script afterwards.)
if gcloud artifacts repositories describe cloud-run-source-deploy --location "$REGION" >/dev/null 2>&1; then
  cat > /tmp/ar-cleanup.json <<'JSON'
[
  {"name": "keep-2", "action": {"type": "Keep"}, "mostRecentVersions": {"keepCount": 2}},
  {"name": "delete-old", "action": {"type": "Delete"}, "condition": {"olderThan": "1d"}}
]
JSON
  gcloud artifacts repositories set-cleanup-policies cloud-run-source-deploy --location "$REGION" --policy=/tmp/ar-cleanup.json >/dev/null || true
fi
echo "✅ GCP project ready. Next: ./deploy/02-deploy.sh"

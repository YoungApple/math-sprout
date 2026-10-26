#!/usr/bin/env bash
# Shared settings for the deploy scripts. Edit these once.
export PROJECT_ID="${PROJECT_ID:-your-gcp-project-id}"
export REGION="${REGION:-asia-east1}"          # Cloud Run region: Taiwan, lowest latency to mainland China
export SERVICE="${SERVICE:-math-sprout}"
export DOMAIN="${DOMAIN:-math.example.com}"    # the subdomain you will serve the app on
export BUCKET="${BUCKET:-${PROJECT_ID}-math-sprout-images}"
# GCS Always-Free (5 GB) only applies to us-west1 / us-central1 / us-east1.
# Photos are read by the server (not the browser), so the extra ~100 ms is invisible.
export BUCKET_LOCATION="${BUCKET_LOCATION:-us-west1}"

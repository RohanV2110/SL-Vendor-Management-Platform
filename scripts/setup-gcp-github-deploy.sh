#!/usr/bin/env bash
# One-time setup: GCP service account for GitHub Actions deploy via IAP (no public SSH required).
set -euo pipefail

PROJECT="${GCP_PROJECT:-shining-relic-494616-t5}"
ZONE="${GCP_ZONE:-us-central1-a}"
INSTANCE="${GCP_INSTANCE:-rohan-noble-vm}"
SA_NAME="${GCP_DEPLOY_SA_NAME:-github-vms-deploy}"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
KEY_FILE="${KEY_FILE:-./github-vms-deploy-sa-key.json}"

echo "Project:  $PROJECT"
echo "Instance: $INSTANCE ($ZONE)"
echo "SA:       $SA_EMAIL"
echo ""

if ! command -v gcloud >/dev/null; then
  echo "Install gcloud CLI first: https://cloud.google.com/sdk/docs/install"
  exit 1
fi

if ! gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q .; then
  echo "Run: gcloud auth login"
  exit 1
fi

gcloud config set project "$PROJECT" >/dev/null

echo "Enabling APIs (idempotent)..."
gcloud services enable compute.googleapis.com iap.googleapis.com --project="$PROJECT"

if ! gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT" >/dev/null 2>&1; then
  echo "Creating service account $SA_NAME..."
  gcloud iam service-accounts create "$SA_NAME" \
    --project="$PROJECT" \
    --display-name="GitHub Actions VMS deploy"
else
  echo "Service account already exists."
fi

bind() {
  local role="$1"
  echo "  + $role"
  gcloud projects add-iam-policy-binding "$PROJECT" \
    --member="serviceAccount:${SA_EMAIL}" \
    --role="$role" \
    --quiet >/dev/null
}

echo "Granting IAM roles..."
bind roles/compute.viewer
bind roles/compute.instanceAdmin.v1
bind roles/iap.tunnelResourceAccessor

echo "Writing key to $KEY_FILE ..."
gcloud iam service-accounts keys create "$KEY_FILE" \
  --iam-account="$SA_EMAIL" \
  --project="$PROJECT"

if command -v gh >/dev/null && gh auth status >/dev/null 2>&1; then
  echo "Setting GitHub secret GCP_DEPLOY_SA_KEY ..."
  gh secret set GCP_DEPLOY_SA_KEY <"$KEY_FILE"
  echo "Secret GCP_DEPLOY_SA_KEY updated."
else
  echo "gh CLI not available — add the secret manually:"
  echo "  gh secret set GCP_DEPLOY_SA_KEY < $KEY_FILE"
fi

echo ""
echo "Testing IAP SSH as node@${INSTANCE}..."
if gcloud compute ssh "node@${INSTANCE}" \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --tunnel-through-iap \
  --quiet \
  --command="echo deploy-ssh-ok"; then
  echo "OK — re-run deploy workflow on GitHub."
else
  echo "IAP SSH test failed. Ensure OS Login or metadata SSH allows user 'node' on the VM."
  exit 1
fi

echo ""
echo "Optional: remove $KEY_FILE after the secret is set (it contains credentials)."
echo "Done."

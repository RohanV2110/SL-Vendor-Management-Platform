#!/usr/bin/env bash
# One-time setup: GitHub Actions → GCP via Workload Identity Federation (no SA keys).
# Org policy iam.disableServiceAccountKeyCreation blocks JSON keys; WIF is the supported path.
set -euo pipefail

PROJECT="${GCP_PROJECT:-shining-relic-494616-t5}"
ZONE="${GCP_ZONE:-us-central1-a}"
INSTANCE="${GCP_INSTANCE:-rohan-noble-vm}"
SA_NAME="${GCP_DEPLOY_SA_NAME:-github-vms-deploy}"
SA_EMAIL="${SA_NAME}@${PROJECT}.iam.gserviceaccount.com"
GITHUB_REPO="${GITHUB_REPO:-RohanV2110/SL-Vendor-Management-Platform}"
GITHUB_OWNER="${GITHUB_OWNER:-RohanV2110}"
POOL="${WIF_POOL:-github}"
PROVIDER="${WIF_PROVIDER_ID:-github}"

echo "Project:  $PROJECT"
echo "Instance: $INSTANCE ($ZONE)"
echo "SA:       $SA_EMAIL"
echo "Repo:     $GITHUB_REPO"
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
PROJECT_NUMBER="$(gcloud projects describe "$PROJECT" --format='value(projectNumber)')"

echo "Enabling APIs (idempotent)..."
gcloud services enable \
  compute.googleapis.com \
  iap.googleapis.com \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  --project="$PROJECT"

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

echo "Granting IAM roles to service account..."
bind roles/compute.viewer
bind roles/compute.instanceAdmin.v1
bind roles/iap.tunnelResourceAccessor

echo "Configuring Workload Identity Federation for GitHub..."
if ! gcloud iam workload-identity-pools describe "$POOL" \
  --project="$PROJECT" --location=global >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "$POOL" \
    --project="$PROJECT" \
    --location=global \
    --display-name="GitHub Actions"
fi

if ! gcloud iam workload-identity-pools providers describe "$PROVIDER" \
  --project="$PROJECT" \
  --location=global \
  --workload-identity-pool="$POOL" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "$PROVIDER" \
    --project="$PROJECT" \
    --location=global \
    --workload-identity-pool="$POOL" \
    --display-name="GitHub" \
    --issuer-uri="https://token.actions.githubusercontent.com" \
    --attribute-mapping="google.subject=assertion.sub,attribute.actor=assertion.actor,attribute.repository=assertion.repository,attribute.repository_owner=assertion.repository_owner" \
    --attribute-condition="assertion.repository_owner=='${GITHUB_OWNER}'"
fi

WIF_RESOURCE="projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/providers/${PROVIDER}"
MEMBER="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL}/attribute.repository/${GITHUB_REPO}"

echo "Binding $SA_EMAIL ← $MEMBER"
gcloud iam service-accounts add-iam-policy-binding "$SA_EMAIL" \
  --project="$PROJECT" \
  --role="roles/iam.workloadIdentityUser" \
  --member="$MEMBER" \
  --quiet >/dev/null

echo ""
echo "Workload Identity Provider (already in deploy.yml env):"
echo "  $WIF_RESOURCE"
echo "Service account:"
echo "  $SA_EMAIL"
echo ""
echo "No GitHub secret required for GCP auth (uses OIDC). Re-run: gh workflow run deploy.yml"
echo ""

echo "Testing IAP SSH to ${INSTANCE} (your user account)..."
if gcloud compute ssh "${INSTANCE}" \
  --project="$PROJECT" \
  --zone="$ZONE" \
  --tunnel-through-iap \
  --quiet \
  --command="echo deploy-ssh-ok"; then
  echo "OK — IAP SSH works from your Mac."
else
  echo "IAP SSH test failed from your account; GitHub may still work via the deploy SA."
  exit 1
fi

echo "Done."

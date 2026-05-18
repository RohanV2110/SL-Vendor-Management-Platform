#!/usr/bin/env bash
# Opens SSH (tcp:22) on the default VPC so GitHub Actions can use DEPLOY_SSH_KEY.
# Prefer IAP deploy: ./scripts/setup-gcp-github-deploy.sh (no public SSH required).
set -euo pipefail

PROJECT="${GCP_PROJECT:-shining-relic-494616-t5}"
RULE="${GCP_SSH_FIREWALL_RULE:-allow-vms-github-ssh}"

gcloud config set project "$PROJECT" >/dev/null

if gcloud compute firewall-rules describe "$RULE" --project="$PROJECT" >/dev/null 2>&1; then
  echo "Firewall rule $RULE already exists."
  gcloud compute firewall-rules describe "$RULE" --project="$PROJECT" \
    --format='table(name,sourceRanges.list(),allowed[].map().firewall_rule().list():label=ALLOW)'
  exit 0
fi

echo "Creating firewall rule $RULE (tcp:22 from 0.0.0.0/0 on network default)..."
gcloud compute firewall-rules create "$RULE" \
  --project="$PROJECT" \
  --direction=INGRESS \
  --priority=1000 \
  --network=default \
  --action=ALLOW \
  --rules=tcp:22 \
  --source-ranges=0.0.0.0/0 \
  --description="Allow SSH for GitHub Actions VMS deploy"

echo "Done. Test: ./scripts/verify-deploy-ssh.sh"
echo "Then re-run the deploy workflow on GitHub."

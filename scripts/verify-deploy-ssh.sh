#!/usr/bin/env bash
# Verifies GitHub deploy SSH access to production. Run on your Mac after adding the
# public key to the SERVER (node@34.46.98.30), not to ~/.ssh/authorized_keys locally.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-node}"
DEPLOY_HOST="${DEPLOY_HOST:-34.46.98.30}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/vms_deploy}"

if [[ ! -f "$KEY" ]]; then
  echo "Missing private key: $KEY"
  exit 1
fi

PUB="${KEY}.pub"
echo "=== Public key (must be on the SERVER in ~${DEPLOY_USER}/.ssh/authorized_keys) ==="
cat "$PUB"
echo ""
echo "=== SSH test: ${DEPLOY_USER}@${DEPLOY_HOST} ==="
if ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=15 "${DEPLOY_USER}@${DEPLOY_HOST}" "echo deploy-ssh-ok"; then
  echo "OK — GitHub Actions deploy SSH should work after DEPLOY_SSH_KEY matches this private key."
  exit 0
fi

echo ""
echo "FAILED — Permission denied or unreachable."
echo "Fix: log into the server (hosting console or existing SSH), then run ON THE SERVER:"
echo "  mkdir -p ~/.ssh && chmod 700 ~/.ssh"
echo "  echo '$(cat "$PUB")' >> ~/.ssh/authorized_keys"
echo "  chmod 600 ~/.ssh/authorized_keys"
echo ""
echo "Do not run those commands on your Mac; they only update this machine."
exit 1

#!/usr/bin/env bash
# Verifies GitHub deploy SSH access to production. Run on your Mac after adding the
# public key to the SERVER (node@ production host), not to ~/.ssh/authorized_keys locally.
set -euo pipefail

DEPLOY_USER="${DEPLOY_USER:-node}"
DEPLOY_HOST="${DEPLOY_HOST:-34.122.29.156}"
KEY="${DEPLOY_KEY:-$HOME/.ssh/vms_deploy}"

if [[ ! -f "$KEY" ]]; then
  echo "Missing private key: $KEY"
  exit 1
fi

PUB="${KEY}.pub"
PUB_LINE="$(cat "$PUB")"
PUB_FINGERPRINT="$(ssh-keygen -lf "$PUB" 2>/dev/null | awk '{print $2}')"

echo "=== Public key (must be on the SERVER in ~${DEPLOY_USER}/.ssh/authorized_keys) ==="
echo "$PUB_LINE"
echo "Fingerprint: ${PUB_FINGERPRINT:-unknown}"
echo ""

if [[ -f "$HOME/.ssh/authorized_keys" ]] && grep -qF "${PUB_LINE%% *}" "$HOME/.ssh/authorized_keys" 2>/dev/null; then
  echo "WARNING: This key is in YOUR Mac's ~/.ssh/authorized_keys — that does NOT help deploy."
  echo "   You must add the same line on the server ${DEPLOY_HOST}, not on this laptop."
  echo ""
fi

echo "=== SSH test: ${DEPLOY_USER}@${DEPLOY_HOST} ==="
if ssh -i "$KEY" -o BatchMode=yes -o ConnectTimeout=25 -o StrictHostKeyChecking=accept-new "${DEPLOY_USER}@${DEPLOY_HOST}" "echo deploy-ssh-ok"; then
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

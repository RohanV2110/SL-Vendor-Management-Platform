# How to deploy the portal

Ship a new version of the Sugar & Leather vendor/partner portal to production by pushing to `main`. GitHub Actions lints, tests, builds a SHA-tagged image, pushes it to GHCR, deploys it to the production VM, and confirms the public URL responds.

## Prerequisites

- Write access to the `RohanV2110/SL-Vendor-Management-Platform` repository, so you can push to `main` or merge a pull request.
- The `gh` CLI installed and authenticated (`gh auth login`) if you want to watch runs from your terminal.
- The one-time GCP setup already done (see [Steps](#steps), step 1). This is needed only once per project, not per deploy.
- For everyday deploys you need nothing else. Auth to GCP is keyless via GitHub OIDC and Workload Identity Federation, so there is no service-account key or GitHub secret to manage.

## How the pipeline works

The workflow is `.github/workflows/deploy.yml` (`name: deploy`). It triggers on:

- `push` to `main`
- `pull_request` to `main`
- `workflow_dispatch` (manual run)

It has two jobs:

- **`test`** runs on every trigger. It checks out the code, sets up Node 22 with npm cache, then runs `npm ci`, `npx prisma generate`, `npm run lint`, and `npm test`.
- **`deploy`** runs only after `test` passes (`needs: test`) and only when the event is a push to `main` or a manual `workflow_dispatch`. Pull requests run the tests but do NOT deploy.

The `concurrency` group is `deploy-production` with `cancel-in-progress: false`, so deploys queue instead of cancelling each other.

The `deploy` job builds and pushes the image, authenticates to GCP, opens an SSH session to the VM, runs the remote deploy script, and health-checks the public URL. Image: `ghcr.io/rohanv2110/sl-vendor-management-platform`, tagged `latest`, `sha-<github.sha>`, and `v<VERSION>` (read from the `VERSION` file, falling back to `0.0.0.0`).

### Auth model

The `deploy` job has permissions `contents: read`, `packages: write`, `id-token: write`. The `id-token` permission lets the job mint a GitHub OIDC token.

1. **GHCR login** uses `github.actor` and the built-in `secrets.GITHUB_TOKEN`.
2. **GCP auth** uses `google-github-actions/auth@v2` with a `workload_identity_provider` and `service_account`. GitHub's OIDC token is exchanged for short-lived GCP credentials through Workload Identity Federation. No JSON key exists, because the org policy `iam.disableServiceAccountKeyCreation` blocks them.
   - Provider: `projects/156522544148/locations/global/workloadIdentityPools/github/providers/github`
   - Service account: `github-vms-deploy@shining-relic-494616-t5.iam.gserviceaccount.com`
3. **SSH to the VM** uses IAP first: `gcloud compute ssh --tunnel-through-iap` to instance `rohan-noble-vm` (project `shining-relic-494616-t5`, zone `us-central1-a`). If IAP fails three times and the `DEPLOY_SSH_KEY` secret is set, it falls back to direct SSH to `node@35.239.155.232`. Either way, `scripts/remote-deploy.sh` re-runs itself as user `node` (via `sudo -u node`) if it lands as another user. IAP is the normal path and needs no GitHub secret.

## Steps

1. **Run the one-time GCP setup (skip if already done).** On a machine with the `gcloud` CLI, authenticate and run the setup script. This creates the deploy service account, grants its IAM roles, and configures Workload Identity Federation.

   ```bash
   gcloud auth login
   ./scripts/setup-gcp-github-deploy.sh
   ```

   Expected result: the script enables the `compute`, `iap`, `iam`, `iamcredentials`, and `sts` APIs, creates or reuses the `github-vms-deploy` service account, grants it `roles/compute.viewer`, `roles/compute.instanceAdmin.v1`, `roles/iap.tunnelResourceAccessor`, `roles/compute.osAdminLogin`, and `roles/iam.serviceAccountUser` on the instance SA, binds `roles/iam.workloadIdentityUser`, and prints `No GitHub secret required for GCP auth (uses OIDC).` followed by a passing IAP SSH test (`OK - IAP SSH works from your Mac.`).

2. **Land your change on `main`.** Push directly or merge a pull request.

   ```bash
   git push origin main
   ```

   Expected result: a `deploy` workflow run starts. On a pull request, only the `test` job runs.

3. **Trigger a deploy manually (optional).** To redeploy the current `main` without a new commit, dispatch the workflow.

   ```bash
   gh workflow run deploy.yml
   ```

   Expected result: a new run of `deploy.yml` appears, runs `test`, then `deploy`.

4. **Wait for the pipeline to finish.** The pipeline runs in order: tests, build and push image, GCP auth, SSH verify, remote deploy, health check. The remote deploy script (`scripts/remote-deploy.sh`) runs on the VM as user `node` and does:

   ```bash
   cd /home/node/docker-stack/SL-Vendor-Management-Platform
   git fetch origin main
   git pull --ff-only origin main
   docker login ghcr.io -u "$GHCR_USER" --password-stdin
   docker pull "$IMAGE"
   export VMS_APP_IMAGE="$IMAGE"
   docker compose up -d --no-build vms-app
   docker image prune -f
   ```

   `IMAGE` is `ghcr.io/rohanv2110/sl-vendor-management-platform:sha-<github.sha>`. When the container starts, its entrypoint (`scripts/docker-init-and-start.sh`) waits for Postgres, creates the database and schema if missing, runs `npx prisma db push`, then `npm run start`.

   Expected result: the new image is running on the VM and the public site responds.

## Verification

- **Watch the run finish.** From the repo, list or watch the latest deploy run.

  ```bash
  gh run list --workflow=deploy.yml --limit=1
  gh run watch
  ```

  Expected result: the run shows as completed and successful.

- **Check the health-check step.** The workflow polls the public URL up to 30 times (5 seconds apart, about 150 seconds total) with `curl -s -o /dev/null -w '%{http_code}' --max-time 5 https://partners.sugarandleather.com/`. It passes on HTTP `200`, `302`, or `307`. The log prints `Production responding (HTTP <code>) after <n>s`.

- **Hit the URL yourself.**

  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' https://partners.sugarandleather.com/
  ```

  Expected result: `200`, `302`, or `307`.

## Troubleshooting

- **Tests or lint fail; deploy never runs.** The `deploy` job needs `test` to pass. Read the failing step in the `test` job (`npm run lint` or `npm test`). Reproduce locally with `npm ci && npx prisma generate && npm run lint && npm test`, fix, and push again.

- **Deploy skipped on a pull request.** This is expected. The `deploy` job only runs on a push to `main` or a manual `workflow_dispatch`. Merge the PR or run `gh workflow run deploy.yml`.

- **"IAP SSH failed and DEPLOY_SSH_KEY is not set."** IAP SSH failed all three attempts and no fallback key is configured. Confirm the VM `rohan-noble-vm` is running in `us-central1-a`, that the IAP and IAM APIs are enabled, and that the `github-vms-deploy` service account still holds `roles/iap.tunnelResourceAccessor` and `roles/compute.osAdminLogin`. Re-run `./scripts/setup-gcp-github-deploy.sh` to reapply roles. As a fallback you can set a `DEPLOY_SSH_KEY` repository secret whose public half is in the VM's `authorized_keys`; that enables direct SSH to `35.239.155.232`.

- **"Both IAP and direct SSH failed."** Both paths failed. Check VM status and network/firewall, then re-run the workflow.

- **GCP authentication step fails.** The OIDC exchange depends on the Workload Identity Federation binding. Confirm the provider attribute condition still matches the repo owner (`assertion.repository_owner=='RohanV2110'`) and that the service account has `roles/iam.workloadIdentityUser`. Re-run `./scripts/setup-gcp-github-deploy.sh`.

- **GHCR pull fails on the VM.** The remote script logs in with `GHCR_USER` (`github.repository_owner`) and `GHCR_TOKEN` (`secrets.GHCR_PULL_TOKEN`, falling back to `secrets.GITHUB_TOKEN`). If the default token cannot pull the package, set a `GHCR_PULL_TOKEN` secret with `read:packages` scope.

- **`git pull --ff-only origin main` fails on the VM.** The checkout at `/home/node/docker-stack/SL-Vendor-Management-Platform` has diverged from `main` (local commits or a dirty tree). SSH in as `node` and reconcile the working tree so a fast-forward pull succeeds, then re-run the deploy.

- **Health check fails after 150 seconds.** The image deployed but the site is not returning `200`, `302`, or `307`. Check the container logs on the VM (`docker compose logs vms-app`). The entrypoint blocks on Postgres via `pg_isready`, so a missing or unreachable database (defaults: `DB_HOST=postgres`, `DB_PORT=5432`, `DB_NAME=sugarleather_vms`, `DB_SCHEMA=public`) or a failing `npx prisma db push` will stop the app from serving. Also confirm `DB_NAME` and `DB_SCHEMA` contain only letters, numbers, and underscores; the entrypoint exits early otherwise.

- **A stale host IP elsewhere.** Some older notes reference `34.46.98.30` as the deploy host. The authoritative value is `35.239.155.232` (`DEPLOY_HOST` in `.github/workflows/deploy.yml`), and even that is only the direct-SSH fallback. The normal path is IAP SSH to instance `rohan-noble-vm`.

## Related

- [Configuration reference](../reference/configuration.md)
- [How to run the portal locally](./run-locally.md)

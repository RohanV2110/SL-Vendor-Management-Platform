# Sugar Leather Partner Platform

The vendor/partner portal for Sugar & Leather's affiliate program: partners
apply, get vetted and activated on a commission tier, drive signups through a
referral code and the Aries signup webhook, submit deals for review, and accrue
commissions in an auditable ledger that admins batch into payouts.

## Documentation

Full developer and operator documentation lives in [`docs/`](docs/README.md),
organized by the [Diátaxis](https://diataxis.fr) framework:

- **New here?** [Getting started](docs/tutorials/getting-started.md)
- **How-to:** [run locally](docs/how-to/run-locally.md) · [onboard a partner](docs/how-to/onboard-a-partner.md) · [configure the Aries webhook](docs/how-to/configure-the-aries-signup-webhook.md) · [record a payout](docs/how-to/record-a-payout.md) · [deploy](docs/how-to/deploy.md)
- **Reference:** [configuration](docs/reference/configuration.md) · [data model](docs/reference/data-model.md) · [routes & server actions](docs/reference/routes-and-server-actions.md)
- **Explanation:** [architecture](docs/explanation/architecture.md) · [commissions & attribution](docs/explanation/commission-and-attribution.md)

> The deploy notes below are a quick summary. The authoritative deploy guide,
> kept in sync with `.github/workflows/deploy.yml`, is
> [docs/how-to/deploy.md](docs/how-to/deploy.md).

## Docker

This compose file connects VMS to the already-running PostgreSQL service on the shared
`docker-stack` network. It does not start a separate database container.

```sh
docker compose up --build
```

The app runs at `http://localhost:3001` by default. Override the host port with `VMS_PORT`;
if you do, also set `VMS_NEXTAUTH_URL` and `VMS_APP_BASE_URL` to the matching public URL.

The app connects to the external Docker service named `postgres` and creates a VMS-specific
database named `sugarleather_vms` by default. Override the host/port with `VMS_DB_HOST` and
`VMS_DB_PORT`. `VMS_DB_USER` and `VMS_DB_PASSWORD` are **required** — the container refuses to
start without them. Also accepts `VMS_DB_NAME`, `VMS_DB_SCHEMA`, or `VMS_DATABASE_URL`.

The startup script at `scripts/docker-init-and-start.sh` waits for PostgreSQL, creates the
database/schema if needed, then runs `prisma db push` because this project does not currently
include Prisma migration files. Uploaded files are stored in the `uploads` Docker volume.

To seed the container database after the services are running:

```sh
docker compose exec vms-app npm run prisma:seed
```

For production, set `VMS_NEXTAUTH_SECRET` (required — the container refuses to start without it), `VMS_DB_USER`, and `VMS_DB_PASSWORD` via your deployment secret manager or in a `.env` file that is not committed to version control. Email and Stripe values remain optional feature flags.

## Production Deployment

Pushes to `main` trigger the GitHub Actions workflow at `.github/workflows/deploy.yml`, which:

1. Runs lint (`npm run lint`) and tests (`npm test`, with Prisma client generation)
2. Builds and pushes a Docker image to GHCR (`ghcr.io/rohanv2110/sl-vendor-management-platform`, tagged `latest`, `sha-<commit>`, and `v<VERSION>`)
3. Authenticates to GCP keylessly via GitHub OIDC and Workload Identity Federation, then deploys over IAP SSH (`gcloud compute ssh --tunnel-through-iap`) to instance `rohan-noble-vm` (zone `us-central1-a`, project `shining-relic-494616-t5`), where `scripts/remote-deploy.sh` pulls the new image and runs `docker compose up -d`. A direct SSH fallback to `35.239.155.232` runs only when a `DEPLOY_SSH_KEY` secret is set.
4. Polls `https://portal.sugarandleather.com/` until it responds

**One-time setup:** run `./scripts/setup-gcp-github-deploy.sh` (after `gcloud auth login`) to create the deploy service account and the Workload Identity Federation binding. The workflow reads `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_DEPLOY_SA_EMAIL`; no SSH key is required for the normal path.

Check deploy status: `gh run list --workflow=deploy.yml --limit=1`

For the full step-by-step deploy guide, see [docs/how-to/deploy.md](docs/how-to/deploy.md).

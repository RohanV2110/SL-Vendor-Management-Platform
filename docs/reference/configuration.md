# Configuration reference

This page lists every environment variable the Sugar & Leather partner portal reads, with required vs optional status, defaults, and the bare-name (local) vs `VMS_`-prefixed (Docker) mapping. It also notes which feature each variable gates.

The app reads its config two ways depending on how you run it:

- **Local** (`next dev` / `next start`): the app reads **bare** names (for example `DATABASE_URL`). Defaults come from `src/lib/env.ts`. Copy `.env.example` to `.env` and fill it in.
- **Docker** (`docker compose up`): you set **`VMS_`-prefixed** names. `docker-compose.yml` maps them to the container's bare names. Four secrets are the exception and are passed through under their bare names (see [Docker exceptions](#docker-exceptions-bare-names)).

## How validation works

`src/lib/env.ts` declares three names as required:

```ts
const required = ["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL"] as const;
```

When any of these is unset, the app calls `console.warn(\`Missing environment variable: ${key}\`)`. It does **not** throw. The app keeps running with whatever values (or `undefined`) it has.

Hard enforcement only exists in Docker. In `docker-compose.yml`, `VMS_DB_USER`, `VMS_DB_PASSWORD`, and `VMS_NEXTAUTH_SECRET` use the `${VAR:?message}` form, so `docker compose` exits with an error before the container starts if any is unset.

The entrypoint `scripts/docker-init-and-start.sh` validates `DB_NAME` and `DB_SCHEMA` against `*[!a-zA-Z0-9_]*`. Either value containing anything other than letters, numbers, or underscores makes the script exit with status 1.

## Local variables (bare names)

These are the names the running app reads. Set them in `.env` for local development.

| Variable | Required | Default (`src/lib/env.ts`) | Gates |
|---|---|---|---|
| `DATABASE_URL` | Yes (warn only) | none | Postgres connection. No default; warns if unset. |
| `NEXTAUTH_SECRET` | Yes (warn only) | none | NextAuth session signing. Warns if unset. |
| `NEXTAUTH_URL` | Yes (warn only) | none | NextAuth callback base URL. Warns if unset. |
| `APP_BASE_URL` | No | `http://localhost:3000` | Absolute URLs the app generates. |
| `UPLOAD_DIR` | No | `./uploads` | Directory the `/api/uploads` route serves files from. |
| `RESEND_API_KEY` | No | none (`undefined`) | Read into `env` but unused. Email is always a stub. |
| `RESEND_FROM_EMAIL` | No | `partners@sugarleather.ai` | Read into `env` but unused. Email is always a stub. |
| `STRIPE_SECRET_KEY` | No | none (`undefined`) | Stripe Connect. When absent, Stripe no-ops to a stub account and the onboarding actions throw an error. |
| `STRIPE_CONNECT_REFRESH_URL` | No | `http://localhost:3000/partner/dashboard` | Stripe Connect onboarding refresh redirect. |
| `STRIPE_CONNECT_RETURN_URL` | No | `http://localhost:3000/partner/dashboard` | Stripe Connect onboarding return redirect. |
| `ARIES_WEBHOOK_SECRET` | No | none (`undefined`) | Shared secret authenticating `POST /api/aries/signup`. |

`.env.example` ships every one of these names with example values:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sugarleather_vms?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-me"
APP_BASE_URL="http://localhost:3000"
UPLOAD_DIR="./uploads"
RESEND_API_KEY=""
RESEND_FROM_EMAIL="partners@sugarleather.ai"
STRIPE_SECRET_KEY=""
STRIPE_CONNECT_REFRESH_URL="http://localhost:3000/partner/dashboard"
STRIPE_CONNECT_RETURN_URL="http://localhost:3000/partner/dashboard"
ARIES_WEBHOOK_SECRET=""
```

### `ARIES_WEBHOOK_SECRET`

This is the shared secret `aries-app` sends when it POSTs partner signups to `/api/aries/signup`. It must match `VMS_WEBHOOK_SECRET` in `aries-app` byte-for-byte. Generate one with:

```bash
openssl rand -hex 32
```

## Docker variables (`VMS_`-prefixed)

Under Docker you set `VMS_`-prefixed names. `docker-compose.yml` (service `vms-app`) maps each to the bare name the container reads.

| You set (`VMS_`) | Maps to (container) | Required | Default |
|---|---|---|---|
| `VMS_DB_HOST` | `DB_HOST` | No | `postgres` |
| `VMS_DB_PORT` | `DB_PORT` | No | `5432` |
| `VMS_DB_USER` | `DB_USER` | Yes (compose errors) | none |
| `VMS_DB_PASSWORD` | `DB_PASSWORD` | Yes (compose errors) | none |
| `VMS_DB_NAME` | `DB_NAME` | No | `sugarleather_vms` |
| `VMS_DB_SCHEMA` | `DB_SCHEMA` | No | `public` |
| `VMS_POSTGRES_ADMIN_DB` | `POSTGRES_ADMIN_DB` | No | `postgres` |
| `VMS_DATABASE_URL` | `DATABASE_URL` | No | empty (built from `DB_*` by the entrypoint) |
| `VMS_NEXTAUTH_URL` | `NEXTAUTH_URL` | No | `http://localhost:3001` |
| `VMS_NEXTAUTH_SECRET` | `NEXTAUTH_SECRET` | Yes (compose errors) | none |
| `VMS_APP_BASE_URL` | `APP_BASE_URL` | No | `http://localhost:3001` |
| `VMS_STRIPE_CONNECT_REFRESH_URL` | `STRIPE_CONNECT_REFRESH_URL` | No | `http://localhost:3001/partner/dashboard` |
| `VMS_STRIPE_CONNECT_RETURN_URL` | `STRIPE_CONNECT_RETURN_URL` | No | `http://localhost:3001/partner/dashboard` |
| `VMS_PORT` | host port (container is `3000`) | No | `3001` |
| `VMS_APP_IMAGE` | container image tag | No | `vms-app:local` |

The Docker URL defaults use port `3001` because that is the default host port (`VMS_PORT`). The local `env.ts` defaults use port `3000`. Both are correct in their own context.

### Hardcoded container values

`docker-compose.yml` sets these directly. You cannot override them through env.

| Variable | Value |
|---|---|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `HOSTNAME` | `0.0.0.0` |
| `UPLOAD_DIR` | `/app/uploads` |

`UPLOAD_DIR` is forced to `/app/uploads` inside the container and is backed by the `uploads` named volume (`uploads:/app/uploads`). The local `./uploads` default does not apply under Docker.

### Docker exceptions (bare names)

Four variables are **not** `VMS_`-prefixed in `docker-compose.yml`. They are passed through under their bare names, so you set them without the prefix even under Docker.

| Variable | Default in compose | Gates |
|---|---|---|
| `RESEND_API_KEY` | empty | Unused. Email is always a stub. |
| `RESEND_FROM_EMAIL` | `partners@sugarleather.ai` | Unused. Email is always a stub. |
| `ARIES_WEBHOOK_SECRET` | empty | Authenticates `POST /api/aries/signup`. |
| `STRIPE_SECRET_KEY` | empty | Stripe Connect (see below). |

### `DATABASE_URL` construction in Docker

`VMS_DATABASE_URL` defaults to empty. When `DATABASE_URL` is empty, `scripts/docker-init-and-start.sh` builds it from the `DB_*` values:

```
postgresql://${DB_USER}:${DB_PASSWORD}@${DB_HOST}:${DB_PORT}/${DB_NAME}?schema=${DB_SCHEMA}
```

Set `VMS_DATABASE_URL` only if you want to override this. Otherwise set the `VMS_DB_*` values and let the script assemble the URL.

The entrypoint also applies its own shell defaults with `:=` if a `DB_*` value reaches it unset: `DB_HOST=postgres`, `DB_PORT=5432`, `DB_USER=postgres`, `DB_PASSWORD=postgres`, `DB_NAME=sugarleather_vms`, `DB_SCHEMA=public`, `POSTGRES_ADMIN_DB=postgres`. These are a fallback inside the script. The "required" enforcement for user and password lives in compose, not the script, so running the script outside compose would not error on a missing user or password.

## Feature gating

**Email is always stubbed.** `src/lib/email.ts` writes to `console.log` regardless of `RESEND_API_KEY` or `RESEND_FROM_EMAIL`. Both values are read into `env` but unused. Setting them changes nothing.

**Stripe Connect depends on `STRIPE_SECRET_KEY`.** When the key is absent, `src/lib/stripe.ts` no-ops to a stub account. The server actions `startStripeOnboardingAction` and `confirmStripeOnboardingAction` throw `Error("Stripe Connect is not configured.")` and do not write stub data when the key is absent.

**Aries signup auth depends on `ARIES_WEBHOOK_SECRET`.** The `POST /api/aries/signup` route authenticates inbound signups from `aries-app` with this shared secret.

The app exposes a small set of API routes:

| Route | Purpose |
|---|---|
| `/api/auth/[...nextauth]` | NextAuth handlers. |
| `/api/uploads?path=<relative>` | Serves a file from `UPLOAD_DIR` at the given relative path. |
| `/api/aries/signup` | Accepts partner signups POSTed by `aries-app`; auth via `ARIES_WEBHOOK_SECRET`. |

## Examples

### Local `.env` for development

Copy `.env.example`, then set real values for the three warned names:

```bash
cp .env.example .env
# edit .env:
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sugarleather_vms?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="$(openssl rand -hex 32)"
ARIES_WEBHOOK_SECRET="$(openssl rand -hex 32)"
```

`STRIPE_SECRET_KEY` stays empty, so Stripe runs in stub mode. Email logs to the console.

### Minimal Docker `.env`

Set only the required `VMS_` values and let defaults and the entrypoint handle the rest:

```bash
VMS_DB_USER=vms
VMS_DB_PASSWORD=super-secret-password
VMS_NEXTAUTH_SECRET=$(openssl rand -hex 32)
ARIES_WEBHOOK_SECRET=$(openssl rand -hex 32)
```

Then bring the stack up:

```bash
docker compose up --build
```

The app listens on host port `3001` (default `VMS_PORT`). `DATABASE_URL` is built from `VMS_DB_*` and the `postgres`/`5432`/`sugarleather_vms`/`public` defaults.

### Docker with Stripe Connect enabled

Add the Stripe key (bare name, no `VMS_` prefix) and the redirect URLs:

```bash
VMS_DB_USER=vms
VMS_DB_PASSWORD=super-secret-password
VMS_NEXTAUTH_SECRET=$(openssl rand -hex 32)
ARIES_WEBHOOK_SECRET=$(openssl rand -hex 32)
STRIPE_SECRET_KEY=sk_live_xxx
VMS_STRIPE_CONNECT_REFRESH_URL=https://partners.example.com/partner/dashboard
VMS_STRIPE_CONNECT_RETURN_URL=https://partners.example.com/partner/dashboard
```

Seed the database after the stack is healthy:

```bash
docker compose exec vms-app npm run prisma:seed
```

## Related

- [How to run the portal locally](../how-to/run-locally.md)
- [Architecture and design decisions](../explanation/architecture.md)
- [How to deploy the portal](../how-to/deploy.md)
- [How to configure the Aries signup webhook](../how-to/configure-the-aries-signup-webhook.md)

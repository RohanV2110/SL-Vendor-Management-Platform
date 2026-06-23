# How to run the portal locally

Get the Sugar & Leather vendor/partner portal running on your machine, then log in as the seeded admin. This guide gives you two paths: bare Node with `next dev` against a local Postgres, and Docker Compose on the shared `docker-stack` network.

Pick one path. The bare Node path is best for active development on port 3000. The Docker path mirrors the deployed setup and runs on port 3001.

## Prerequisites

- Node.js and npm (the repo uses Next.js, Prisma 6, and `tsx`).
- A running PostgreSQL instance.
  - Bare Node path: Postgres reachable at `localhost:5432`.
  - Docker path: the external Docker network named `docker-stack` and a service named `postgres` on it.
- Docker and the Compose plugin (Docker path only).
- The repo cloned at `/home/node/docker-stack/SL-Vendor-Management-Platform`.

The repo has no Prisma migration files. Both paths create the schema with `prisma db push`, not `prisma migrate`.

---

## Path A: bare Node + `next dev`

### Steps

1. **Install dependencies.** From the repo root:

   ```bash
   npm install
   ```

   Expected result: `node_modules/` is populated. The package is `sugar-leather-partner-platform` (private, version `0.0.1.0`).

2. **Create your `.env`.** Copy the example and edit it:

   ```bash
   cp .env.example .env
   ```

   `.env.example` ships these values:

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

   The three required variables are `DATABASE_URL`, `NEXTAUTH_URL`, and `NEXTAUTH_SECRET`. Point `DATABASE_URL` at your Postgres and set `NEXTAUTH_SECRET` to a real value (do not ship `replace-me`). Generate one with:

   ```bash
   openssl rand -hex 32
   ```

   The rest are optional and gate features: `APP_BASE_URL` and `UPLOAD_DIR` for local paths, `RESEND_*` for email, `STRIPE_*` for payouts, and `ARIES_WEBHOOK_SECRET` for the `/api/aries/signup` webhook that the `aries-app` stack POSTs to.

3. **Generate the Prisma client.**

   ```bash
   npm run prisma:generate
   ```

   This runs `prisma generate`. Expected result: the typed Prisma client is written into `node_modules`.

4. **Push the schema to the database.**

   ```bash
   npx prisma db push
   ```

   Expected result: Prisma creates the tables in the database named in `DATABASE_URL`. Use `db push` here, not `npm run prisma:migrate`. The repo has no migration files, so `prisma migrate dev` has nothing to apply.

5. **Seed starter data.**

   ```bash
   npm run prisma:seed
   ```

   This runs `tsx prisma/seed.ts`. Expected result: the final log line reads:

   ```
   Seeded admin user: admin@sugarleather.ai password: Admin123!
   ```

   The seed creates the admin user, product `aries-ai`, package `core-platform`, the `affiliate` and `authorized-reseller` tiers with their commission rules, three application question prompts, and one sample partner application/account/agreement. The seed is idempotent: it uses `upsert`, so re-running it is safe.

6. **Start the dev server.**

   ```bash
   npm run dev
   ```

   This runs `next dev`. Expected result: the portal is reachable at `http://localhost:3000`.

### Verification (Path A)

1. Open `http://localhost:3000/login`.
2. Sign in with the seeded admin:
   - Email: `admin@sugarleather.ai`
   - Password: `Admin123!`
3. You can now reach the admin area under `/admin`. The partner area lives under `/partner`, and the public application form is at `/apply`.

To confirm the data layer independently, run the test suite:

```bash
npm test
```

This runs `vitest run`. Only `tests/rules.test.ts` exists today; it should pass.

---

## Path B: Docker Compose on the shared network

This path builds the app image from `./Dockerfile` and runs a single service, `vms-app`. There is no database container. The app connects to an external Postgres service named `postgres` on the external Docker network `docker-stack`.

### Steps

1. **Make sure the external network and Postgres exist.** Compose expects a network whose real name is `docker-stack` (declared in `docker-compose.yml` under the key `docker_stack` with `external: true`) and a Postgres service named `postgres` on it. These come from the `aries-app` stack. Confirm the network:

   ```bash
   docker network ls | grep docker-stack
   ```

2. **Set the required environment variables.** Compose refuses to start without these three:

   ```bash
   export VMS_DB_USER=postgres
   export VMS_DB_PASSWORD=your-postgres-password
   export VMS_NEXTAUTH_SECRET="$(openssl rand -hex 32)"
   ```

   If any are missing, Compose stops with an error such as `VMS_DB_USER is required`.

   Optional overrides and their defaults:

   - `VMS_PORT` (default `3001`) - host port mapped to the container's `3000`.
   - `VMS_DB_HOST` (default `postgres`), `VMS_DB_PORT` (default `5432`).
   - `VMS_DB_NAME` (default `sugarleather_vms`), `VMS_DB_SCHEMA` (default `public`).
   - `VMS_NEXTAUTH_URL` and `VMS_APP_BASE_URL` (both default `http://localhost:3001`).
   - `VMS_DATABASE_URL` (default empty). Leave it empty to let the entrypoint build the URL from the `DB_*` parts.

3. **Build and start the stack.** From the repo root:

   ```bash
   docker compose up --build
   ```

   Expected result: the image builds, then `scripts/docker-init-and-start.sh` runs. It waits for Postgres with `pg_isready`, creates the database if it does not exist (`CREATE DATABASE`), runs `CREATE SCHEMA IF NOT EXISTS`, applies the schema with `npx prisma db push`, and finally starts the app with `npm run start`. The container listens on `3000` internally and is published on the host at `VMS_PORT` (default `3001`).

   The entrypoint validates `DB_NAME` and `DB_SCHEMA`: each must contain only letters, numbers, and underscores, or the container exits with an error.

4. **Seed starter data.** In a second terminal, once the app is up:

   ```bash
   docker compose exec vms-app npm run prisma:seed
   ```

   Expected result: same seed output as Path A, ending with `Seeded admin user: admin@sugarleather.ai password: Admin123!`.

### Verification (Path B)

1. Open `http://localhost:3001` (or your `VMS_PORT`).
2. The Compose healthcheck probes `http://localhost:3000/` inside the container with `wget`. Check service health:

   ```bash
   docker compose ps
   ```

   Expected result: `vms-app` shows status `healthy`.
3. Go to `http://localhost:3001/login` and sign in with `admin@sugarleather.ai` / `Admin123!`.

---

## Troubleshooting

- **`prisma migrate` does nothing / "No migration found".** Expected. The repo has no migration files. Use `npx prisma db push` (Path A) or let the Docker entrypoint do it.

- **NextAuth errors or login redirect loops.** `NEXTAUTH_SECRET` is unset or still `replace-me`, or `NEXTAUTH_URL` does not match the URL you are visiting. Set a real secret and make `NEXTAUTH_URL` match the host and port (`http://localhost:3000` bare, `http://localhost:3001` Docker).

- **Cannot connect to the database (Path A).** Confirm Postgres is up on `localhost:5432` and that `DATABASE_URL` credentials and database name are correct. The default targets database `sugarleather_vms`.

- **Compose exits immediately with `... is required` (Path B).** You did not export `VMS_DB_USER`, `VMS_DB_PASSWORD`, or `VMS_NEXTAUTH_SECRET`. Set all three, then re-run `docker compose up --build`.

- **`network docker-stack declared as external, but could not be found` (Path B).** The external network is not present. Start the `aries-app` stack that owns it, or create the network, then retry.

- **Container hangs at "Waiting for PostgreSQL..." (Path B).** The entrypoint cannot reach Postgres. Check that the `postgres` service is on the `docker-stack` network and that `VMS_DB_HOST`, `VMS_DB_PORT`, `VMS_DB_USER`, and `VMS_DB_PASSWORD` are correct.

- **Container exits with "DB_NAME must contain only letters, numbers, and underscores" (Path B).** You set `VMS_DB_NAME` or `VMS_DB_SCHEMA` to a value with disallowed characters. Use simple identifiers like `sugarleather_vms` and `public`.

- **Login fails with the seeded credentials.** You probably skipped the seed step. Run `npm run prisma:seed` (Path A) or `docker compose exec vms-app npm run prisma:seed` (Path B). The seed is idempotent, so re-running it is safe.

## Related

- [Getting started: run the portal and activate your first partner](../tutorials/getting-started.md)
- [Configuration reference](../reference/configuration.md)
- [How to deploy the portal](./deploy.md)

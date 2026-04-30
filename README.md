# Sugar Leather Partner Platform

## Docker

This compose file connects VMS to the already-running PostgreSQL service on the shared
`docker-stack` network. It does not start a separate database container.

```sh
docker compose up --build
```

The app runs at `http://localhost:3001` by default. Override the host port with `VMS_PORT`;
if you do, also set `VMS_NEXTAUTH_URL` and `VMS_APP_BASE_URL` to the matching public URL.

The app connects to the external Docker service named `postgres` and creates a VMS-specific
database named `sugarleather_vms` by default. Override these with `DB_HOST`, `DB_PORT`,
`DB_USER`, `DB_PASSWORD`, `VMS_DB_NAME`, `VMS_DB_SCHEMA`, or `VMS_DATABASE_URL`.

The startup script at `scripts/docker-init-and-start.sh` waits for PostgreSQL, creates the
database/schema if needed, then runs `prisma db push` because this project does not currently
include Prisma migration files. Uploaded files are stored in the `uploads` Docker volume.

To seed the container database after the services are running:

```sh
docker compose exec vms-app npm run prisma:seed
```

For production, replace `NEXTAUTH_SECRET`, email, and Stripe values in `docker-compose.yml` or provide them through your deployment secret manager.

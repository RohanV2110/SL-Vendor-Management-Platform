# Getting started: run the portal and activate your first partner

This tutorial takes you from a fresh clone to a running Sugar & Leather partner portal. You will sign in as the seeded admin, activate the seeded partner, and reach the partner referral link a partner shares into Aries.

By the end you will have:

- The portal running at `http://localhost:3000`.
- A signed-in admin session (`admin@sugarleather.ai`).
- A walk through marking the seeded partner's documents signed and activating the account.
- A referral link of the form `https://aries.sugarandleather.com/signup?ref=<code>`.

You will see a running login page within the first 3 steps.

## Before you start

You need:

- Node.js (the repo targets Next.js 15 and Prisma 6).
- A running PostgreSQL server you can connect to. The default connection string points at `postgresql://postgres:postgres@localhost:5432/sugarleather_vms`.

All commands run from the repo root: `/home/node/docker-stack/SL-Vendor-Management-Platform`.

This is the bare Node path, which is the simplest way to run the app. The Docker path uses different ports and variables and is not covered here.

## Step 1: Install dependencies and write your env file

Install the packages:

```bash
npm install
```

Create a `.env` file by copying the example:

```bash
cp .env.example .env
```

Open `.env` and set a real value for `NEXTAUTH_SECRET` (the example ships `replace-me`). Generate one:

```bash
openssl rand -hex 32
```

Paste the output as the secret. The three required variables are `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL`. The example file already sets working defaults for the bare Node path:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/sugarleather_vms?schema=public"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="replace-me"
APP_BASE_URL="http://localhost:3000"
UPLOAD_DIR="./uploads"
```

Leave the optional keys (`RESEND_API_KEY`, `STRIPE_SECRET_KEY`, `ARIES_WEBHOOK_SECRET`) empty. Email sends are a `console.log` stub and Stripe no-ops when `STRIPE_SECRET_KEY` is empty, so the happy path works without them.

If your Postgres uses different credentials, host, or port, edit `DATABASE_URL` to match.

You now have dependencies installed and a valid `.env`.

## Step 2: Create the schema and seed the data

Generate the Prisma client:

```bash
npm run prisma:generate
```

Push the schema into your database. This repo has no migration files, so use `db push` rather than `prisma migrate`:

```bash
npx prisma db push
```

Seed the starter data:

```bash
npm run prisma:seed
```

You should see this line in the output:

```
Seeded admin user: admin@sugarleather.ai password: Admin123!
```

The seed creates the admin user (role `ADMIN`), the `aries-ai` product, the `core-platform` package, two tiers (`affiliate` and `authorized-reseller`), commission rules, three question prompts, and one sample partner application (Jordan Miles) along with its partner account, profile, and agreement records.

### If `npx prisma db push` fails to connect

A connection error like `Can't reach database server at localhost:5432` means Postgres is not running or the URL is wrong. Start your database, confirm the host and port, and check that `DATABASE_URL` in `.env` matches. Then run `npx prisma db push` again.

You now have a database with an admin account and seeded reference data.

## Step 3: Start the portal

Run the dev server:

```bash
npm run dev
```

Next.js starts on port 3000. Open this URL in your browser:

```
http://localhost:3000/login
```

You should see the "Access the partner platform" login page. The portal is now running and visible.

### If port 3000 is already in use

Next.js will pick a different port and print it (for example `http://localhost:3001`). Either free port 3000 and restart, or use the port Next.js prints. If you change the port, update `NEXTAUTH_URL` and `APP_BASE_URL` in `.env` to match, then restart `npm run dev`, so auth redirects stay correct.

## Step 4: Sign in as the seeded admin

On the login page, enter the seeded credentials:

- Email: `admin@sugarleather.ai`
- Password: `Admin123!`

Submit the form. You land on the admin overview at `/admin`. The page is guarded by `requireRole("ADMIN")`, so only the admin account can see it. You will see stat cards for Total deals, Partners, Referrals awaiting action, and the ledger total, plus a list of recent notifications.

You are now signed in as the admin.

## Step 5: Review and activate the seeded partner

The seed already turned Jordan Miles's application into a partner account with status `PENDING_DOCUMENTS`, so you review it from the Partners list. Go to:

```
http://localhost:3000/admin/partners
```

The Jordan Miles row shows a "Review" button because the partner is not yet active. Click it to open the partner detail page at `/admin/partners/<id>`.

Under "NDA & agreement approval", mark both the NDA and the partner agreement as signed. Each button submits `markPartnerDocumentSignedAction`, which calls `requireRole("ADMIN")` and reads `partnerAccountId`, `documentType`, and `signed` from the form.

Once both documents are marked signed, the "Activate partner" button enables. Select a tier (the seed gives you the `affiliate` and `authorized-reseller` tiers) and submit. That runs `approvePartnerAction`, which calls `requireRole("ADMIN")` and reads `partnerAccountId` and `tierId`, moving the partner to `ACTIVE`.

You now have an active partner account.

## Step 6: Generate the partner referral link

Once the account is active, the partner generates its own referral code. The `generateVendorReferralCodeAction` action calls `requireRole("PARTNER")` and only lets a partner manage their own code, so it runs from the partner surfaces (`/partner/dashboard` and `/partner/referrals`), not the admin pages. As the admin you can see the finished link in the partner details dialog on `/admin/partners` once the code exists.

The portal builds the shareable link with `buildAriesReferralLink(code)`, which returns:

```
https://aries.sugarandleather.com/signup?ref=<code>
```

That link is what a partner shares to bring signups into Aries. Seeing it is the end of the happy path.

## What you built

You took a fresh clone to a running portal. You installed dependencies, wrote a valid `.env`, pushed the schema, and seeded an admin plus reference data. You signed in as `admin@sugarleather.ai`, marked the seeded partner's documents signed, activated the account, and reached the partner referral link that points at the Aries signup page.

Next steps:

- Read [../how-to/run-locally.md](../how-to/run-locally.md) for more on local setup options.
- Read [../how-to/onboard-a-partner.md](../how-to/onboard-a-partner.md) for the full onboarding flow.
- Read [../reference/data-model.md](../reference/data-model.md) to learn the data model behind these screens.

## Related

- [How to run the portal locally](../how-to/run-locally.md)
- [How to onboard a partner](../how-to/onboard-a-partner.md)
- [Data model reference](../reference/data-model.md)

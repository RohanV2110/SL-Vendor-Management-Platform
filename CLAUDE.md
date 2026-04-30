# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `npm run dev` — Next.js dev server (port 3000).
- `npm run build` — runs `prisma generate` then `next build`.
- `npm run start` — production server.
- `npm run lint` — Next.js ESLint.
- `npm run test` — Vitest one-shot. `npm run test:watch` for watch mode.
- Run a single test: `npx vitest run tests/rules.test.ts` (use `-t "<name>"` to filter by test name).
- `npm run prisma:generate` — regenerate Prisma client after schema edits.
- `npm run prisma:migrate` — create/apply a dev migration. **Note:** the repo currently has no migration files; the Docker entrypoint uses `prisma db push` instead.
- `npm run prisma:seed` — seed via `prisma/seed.ts`.

### Docker

- `docker compose up --build` — starts the app on `http://localhost:${VMS_PORT:-3001}`. Connects to an externally-managed Postgres on the shared `docker-stack` network (does not start its own DB).
- `docker compose exec vms-app npm run prisma:seed` — seed inside the container.
- `scripts/docker-init-and-start.sh` waits for Postgres, creates `${VMS_DB_NAME:-sugarleather_vms}` + `${VMS_DB_SCHEMA:-public}` if missing, runs `prisma db push`, then `npm run start`. If you change `VMS_PORT`, also update `VMS_NEXTAUTH_URL` and `VMS_APP_BASE_URL` to match.

## Architecture

Next.js 15 App Router + Prisma 6 (Postgres) + NextAuth (Credentials, JWT) + Stripe Connect Express. Transactional email is currently a `console.log` stub (`src/lib/email.ts`); Resend env vars are scaffolded but not wired.

### Layers

- **`src/app`** — App Router routes, segmented by audience: `admin/*`, `partner/*`, `(public)/apply`, `login`. Pages are server components that call helpers from `src/lib/auth-helpers.ts` to enforce role and load data via Prisma directly or via service functions. API routes are limited to `/api/auth/[...nextauth]` and `/api/uploads` (which streams a single file from `UPLOAD_DIR` based on a `?path=<relative>` query string).
- **`src/lib/actions.ts`** — server actions (`"use server"`). Each action: auth-guards, parses `FormData` against a Zod schema in `src/lib/validators/platform.ts`, delegates to a service function, then `revalidatePath`s. Add new mutations here, not in route handlers.
- **`src/lib/services/platform.ts`** — single module owning all multi-step business logic and Prisma transactions: applications, partner activation, agreements + documents, referrals, deals, commission ledger, payout batches, quarterly snapshots, Stripe Connect onboarding, audit log + notification fan-out. Most functions take an `actorUserId` and write an `AuditLog` row in the same transaction as the mutation.
- **`src/lib/rules.ts`** + **`src/lib/utils.ts`** — pure helpers (commission math, first-attribution check, quarterly threshold evaluation, `normalizeLeadKey`, currency/date formatting). These are the unit-tested core; keep them framework-free.
- **`src/lib/auth.ts`** + **`src/lib/auth-helpers.ts`** — NextAuth options and `requireUser` / `requireRole(role)` / `requirePartnerAccountId()` redirect-based guards used by every protected surface.
- **`src/lib/{prisma,email,stripe,storage,env,referral-links}.ts`** — singletons and adapters. `env.ts` only warns on missing vars. Stripe no-ops to a stub account when `STRIPE_SECRET_KEY` is absent (`src/lib/stripe.ts`); email always stubs to a `console.log` regardless of env.

### Domain model (`prisma/schema.prisma`)

`PartnerApplication` → review → spawns `PartnerAccount` (+ `PartnerProfile`, `User`, `PartnerInvite`, NDA/partner-agreement `AgreementDocument`s) → `Agreement` snapshots tier terms at activation time.

`Tier` + `TierRule` (product/package-scoped) define upfront/trailing commission rates, clawback window, and quarterly thresholds.

`Referral` (deduped via `normalizedLeadKey`; first attribution wins, later submissions become `DUPLICATE_NOT_ATTRIBUTED`) → optional `Deal` → on close, `CommissionLedgerEntry` rows (UPFRONT/TRAILING/CLAWBACK/ADJUSTMENT) flow `PENDING_APPROVAL → APPROVED → SCHEDULED → PAYABLE → PAID` and bundle into a `PayoutBatch` (eventually a Stripe payout).

`QuarterlyActivitySnapshot` records each partner's per-quarter performance vs. their tier's thresholds (`MET_THRESHOLD` / `BELOW_THRESHOLD` / `OVERRIDDEN`).

Vendor referral codes: a partner can generate a code; `referredByVendorId` / `referralCodeUsed` on both `PartnerApplication` and `PartnerAccount` track multi-level attribution.

Cross-cutting: `AuditLog`, `Notification`, `InternalNote` (polymorphic via `NoteEntityType`).

### Conventions

- TypeScript strict; path alias `@/*` → `src/*`.
- Server actions return `string | undefined` (error message) on validation failure and `redirect()` on success.
- Mutations that change domain state should write an `AuditLog` and (where relevant) a `Notification` inside the same Prisma transaction — see the helpers at the top of `src/lib/services/platform.ts`.
- Decimal money fields use `Prisma.Decimal` at rest; convert to `Number` only at presentation or rule-evaluation boundaries.
- Uploads go through `saveUploadedFile` in `src/lib/storage.ts` and are served from `/api/uploads?path=<relative>` — do not expose `UPLOAD_DIR` paths directly.

### Environment

Required: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`. Optional / feature-gating: `STRIPE_SECRET_KEY` + `STRIPE_CONNECT_{REFRESH,RETURN}_URL` (payouts), `APP_BASE_URL`, `UPLOAD_DIR`. `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are read into `env.ts` but currently unused — email is stubbed. See `.env.example`.

### Testing

Vitest with `jsdom` and the `@/*` alias (`vitest.config.ts`). `tests/setup.ts` is a stub. Existing coverage is limited to pure rule helpers in `tests/rules.test.ts` — there is no DB or component test harness yet.

## Deploy Configuration (configured by /setup-deploy)
- Platform: GitHub Actions (build container image + SSH deploy)
- Production URL: https://portal.sugarandleather.com
- Deploy workflow: `.github/workflows/deploy.yml` (test → build & push to GHCR → SSH deploy to `node@34.46.98.30:/home/node/docker-stack/SL-Vendor-Management-Platform` → health check)
- Image registry: `ghcr.io/rohanv2110/sl-vendor-management-platform` (tags: `latest`, `sha-<commit>`, `v<VERSION>`)
- Deploy status command: `gh run list --workflow=deploy.yml --limit=1`
- Required repo secret: `DEPLOY_SSH_KEY` (private ed25519 key whose public half is in `node@34.46.98.30:~/.ssh/authorized_keys`)
- Merge method: squash
- Project type: web app (Next.js 15 + Prisma, containerized via Dockerfile + docker-compose)
- Post-deploy health check: `curl -fsS https://portal.sugarandleather.com/ -o /dev/null` (probe was unreachable from this sandbox at setup time — verify from a network with access)

### Custom deploy hooks
- Pre-merge: `npm run build` (runs `prisma generate && next build`); `npm run test`
- Deploy trigger: GitHub Actions workflow on push to `main` (workflow file pending)
- Deploy status: `gh run watch` on the deploy workflow run, then HTTP probe of production URL
- Health check: `https://portal.sugarandleather.com/`
- Container entrypoint: `scripts/docker-init-and-start.sh` waits for Postgres, runs `prisma db push`, then `npm run start`. Any deploy must run this entrypoint or replicate its steps.

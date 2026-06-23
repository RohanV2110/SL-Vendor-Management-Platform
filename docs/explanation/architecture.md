# Architecture and design decisions

This page explains how the Sugar & Leather vendor/partner portal is built and why. It is for an engineer who has never seen the code and wants to understand the shape of the system before touching it.

## The problem

A partner portal touches money. A referral gets attributed, a deal closes, a commission accrues, a payout goes out, a clawback reverses it. If any of those steps writes to the database but the record of *who did it and why* lands somewhere else (or nowhere), you get the classic failure: the numbers move and nobody can reconstruct the story. An admin approves a partner, the partner row flips to active, but the approval is lost because the audit write happened in a separate call that failed after the commit. Now you have a state you cannot explain and cannot defend.

This portal is designed so that does not happen. State changes and their audit trail commit together or not at all. The cost of that guarantee, and several other deliberate shortcuts, is the subject of this page.

## The approach: one path in, one path down

Every write follows the same route. There is exactly one way data changes, and it has four layers.

```
  Browser (form submit)
        |
        v
  +-----------------------------+
  | App Router page             |  React Server Components
  | (server component)          |  read via services, render
  +-----------------------------+
        |
        v
  +-----------------------------+
  | Server action               |  src/lib/actions.ts ("use server")
  |  - requireRole / requirePar |  auth guard
  |    tnerAccountId            |
  |  - Zod parse (validators)   |  validate FormData
  |  - call service fn          |
  |  - revalidatePath / redirect|
  +-----------------------------+
        |
        v
  +-----------------------------+
  | Services module             |  src/lib/services/platform.ts
  |  - prisma.$transaction(tx => {
  |      mutate(tx)             |  business logic + multi-step writes
  |      createAuditLog(tx)     |  audit row, SAME tx
  |      createPartnerNotificat |  notifications, SAME tx
  |      ion / createAdminNotif |
  |    })                       |
  +-----------------------------+
        |
        v
  +-----------------------------+
  | Prisma client (singleton)   |  src/lib/prisma.ts -> Postgres
  +-----------------------------+
```

### Layer 1: App Router server-component pages

Pages are React Server Components. They read data by calling the services module directly and render HTML on the server. There is no client-side data-fetching layer and no REST API in front of the database for the portal's own screens.

### Layer 2: server actions

`src/lib/actions.ts` starts with `"use server"`, so every exported function is a server action invocable from a form. Each action does the same four things in order:

1. Auth-guard with `requireRole(...)` or `requirePartnerAccountId()` from `@/lib/auth-helpers`.
2. Parse the incoming `FormData` against a Zod schema from `@/lib/validators/platform`.
3. Delegate to one function in the services module.
4. Call `revalidatePath(...)` to refresh the affected screens, and `redirect(...)` on success in flows that change page (for example `submitApplicationAction` redirects to `/login?applied=1`).

Actions hold no business logic. They are the guard rail and the translator between the browser and the services module.

### Layer 3: a single services module

`src/lib/services/platform.ts` is one file (roughly 2,800 lines) that owns all multi-step logic and every `prisma.$transaction(...)` call: applications, activation, agreements and documents, referrals, deals, the commission ledger, payout batches, quarterly snapshots, Stripe onboarding, vendor referral codes, and manual affiliates. Concentrating this in one module is a deliberate choice. It means there is exactly one place to read to understand how money and state move, and there is no second code path that can mutate these tables without going through the transaction discipline below.

### Layer 4: Prisma

`src/lib/prisma.ts` exports a singleton client cached on `globalThis` so hot-reload in development does not open a new connection pool on every change. It logs `["error", "warn"]` in development and `["error"]` otherwise.

For the exact list of routes, actions, and service functions, see [the routes and server actions reference](../reference/routes-and-server-actions.md). For tables and enums, see [the data model reference](../reference/data-model.md).

## The audit-log-in-the-same-transaction pattern

This is the load-bearing decision. Two private helpers sit at the top of `platform.ts`:

- `createAuditLog(tx, payload)` calls `tx.auditLog.create(...)`.
- `createPartnerNotification(tx, ...)` and `createAdminNotifications(tx, ...)` call `tx.notification.create` / `createMany`.

All three take the transaction client `tx`, not the global `prisma`. They run *inside* the same `prisma.$transaction(...)` as the mutation they describe. So when `createPayoutBatch` flips ledger entries to `PAYABLE`, the `payout_batch.created` audit row commits in the same atomic unit. Either both land or neither does. You cannot end up with a state change that has no recorded cause.

The audit payload shape is:

```ts
type AuditPayload = {
  actorUserId?: string | null;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  previousState?: Prisma.InputJsonValue;
  nextState?: Prisma.InputJsonValue;
};
```

Most admin-driven service functions take an `actorUserId` (or `adminUserId`) parameter and pass it through, so the audit row names a person. For example `approvePartnerAccount({ partnerAccountId, tierId, adminUserId })`. Some self-serve and system flows intentionally write audit rows with no actor: `submitPartnerApplication`, `createReferral`, `completePartnerInvite`, and `uploadPartnerDocument`. A prospect submitting an application is not an authenticated actor, so `actorUserId` is omitted rather than faked.

Notifications fan out in the same transaction. `createAdminNotifications` targets only users where `role: UserRole.ADMIN` and `isActive: true`, so deactivated admins stop receiving alerts without any extra bookkeeping.

## Force-synced schema, no migration history

There are no Prisma migration files. `prisma/migrations` does not exist on disk. The schema reaches the database by force-sync, not by versioned migrations.

The Docker entrypoint, `scripts/docker-init-and-start.sh`, is a `sh` script run with `set -eu`. It waits for Postgres with `pg_isready`, creates the database if it is missing, runs `CREATE SCHEMA IF NOT EXISTS`, then:

```sh
npx prisma db push
exec npm run start
```

`prisma db push` runs on every container start. It makes the database match `schema.prisma` and does not record a migration or offer a rollback path. The `build` script is `prisma generate && next build`, which only generates the client; it does not touch the database. A `prisma:migrate` script (`prisma migrate dev`) exists in `package.json` but the entrypoint never calls it, so migrations are effectively not part of how this app ships. Seed data is applied separately via `prisma:seed` (`tsx prisma/seed.ts`).

> Note on Docker environment variables: the entrypoint reads un-prefixed vars (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` defaulting to `sugarleather_vms`, `DB_SCHEMA` defaulting to `public`, `POSTGRES_ADMIN_DB`, and `DATABASE_URL`). If your deployment sets `VMS_`-prefixed names, the mapping to these happens in `docker-compose.yml`, not in this script.

## The deliberately manual stubs

Three integrations are intentionally incomplete. The portal runs end to end without any of them, because the missing parts are done by hand or skipped.

### Email is a console.log

`src/lib/email.ts` `sendTransactionalEmail` does exactly one thing:

```ts
console.log("Email stub", payload.to, payload.subject);
return { ok: true };
```

It always stubs, regardless of environment. `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are read in `env.ts` but nothing uses them. No partner email is actually delivered. Notifications the partner sees come from the in-database `Notification` rows, not from email.

### Stripe onboards bank details only

`src/lib/stripe.ts` constructs the Stripe client only if `env.stripeSecretKey` is set, otherwise it is `null`. Two behaviors follow:

- `provisionConnectAccount(email, businessName)` returns a stub id of the form `stub_<businessname>` when there is no key; with a key it calls `stripe.accounts.create({ type: "express", ... })`.
- `createConnectOnboardingLink(accountId)` uses `type: "account_onboarding"` (collecting bank/identity details for an Express account) with a key, or returns `${appBaseUrl}/partner/dashboard?stripe=stub` without one.

The Stripe server actions refuse to run unconfigured: `startStripeOnboardingAction` and `confirmStripeOnboardingAction` both `throw new Error("Stripe Connect is not configured.")` when `env.stripeSecretKey` is missing. Stripe's role here is narrow: collect the partner's bank details so a human knows where to send money. It does not move money.

### Payouts are recorded by hand

Money movement is off-platform. `createPayoutBatch` requires `partner.stripeOnboardingComplete` to be true, then creates a `PayoutBatch` in status `READY` and flips its ledger entries to `PAYABLE`. `markPayoutBatchPaid` takes an optional `stripePayoutId` that an admin types into the form (`markPayoutBatchPaidAction` reads it from `FormData`). It sets the batch to `PayoutBatchStatus.PAID` and the entries to `CommissionLedgerStatus.PAID`, then notifies the partner. There is no Stripe transfer call anywhere in this path. An admin sends the money in Stripe (or a bank), copies the payout id back into the portal, and the portal records that it happened.

The commission ledger that feeds payouts uses statuses `PENDING_APPROVAL`, `APPROVED`, `SCHEDULED`, `PAYABLE`, `PAID`, `VOID`, `CLAWED_BACK` and entry types `UPFRONT`, `TRAILING`, `CLAWBACK`, `ADJUSTMENT`. Clawbacks are modeled as a new entry with a negated amount, not by mutating the original. See [commission and attribution](./commission-and-attribution.md) for how those states transition.

## Trade-offs

What this design gives up, stated plainly:

- **No migration history, no rollback.** `prisma db push` cannot roll back and keeps no record of how the schema got to its current shape. A destructive schema change (dropping a column, narrowing a type) can drop data on the next container start with no audit of the change and no down-migration to reverse it. The convenience of force-sync is paid for in production safety.
- **Manual payouts can drift from reality.** Because `markPayoutBatchPaid` only records an admin-supplied `stripePayoutId` and never calls Stripe, the ledger says PAID whether or not money actually moved. A typo or a forgotten transfer produces a ledger that disagrees with the bank. The audit row proves *who clicked paid*, not *that the transfer settled*.
- **No real email means silent partners.** Anything that should reach a partner by email does not. If a partner does not log in to see their `Notification` rows, they are not reached. Application approvals, payout confirmations, and document requests all depend on the partner checking the portal.
- **Stripe is opt-in and partial.** Without `STRIPE_SECRET_KEY` the onboarding actions throw, so a misconfigured environment fails loudly at the Stripe step (good), but even fully configured, Stripe only collects bank details. The portal never holds funds or initiates transfers, so there is no programmatic reconciliation.
- **One large services module.** Concentrating all logic in `platform.ts` makes the transaction discipline easy to enforce and easy to read top to bottom, but the file is large and every change to business logic lands in the same place. Merge contention and cognitive load grow with it.
- **A single shared Postgres.** The portal assumes one database. There is no read replica or sharding in this design, so it scales vertically until it does not.
- **Required env vars are warn-only.** `env.ts` checks `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` and only `console.warn`s if they are missing. The app will boot misconfigured and fail later instead of refusing to start.

## Alternatives that were not taken

- **Versioned migrations** (`prisma migrate deploy` in the entrypoint) would give a rollback path and a recorded schema history. The script ships `prisma db push` instead, trading safety for setup speed. A `prisma:migrate` script exists but is unused, so moving to migrations is mostly a matter of changing the entrypoint and generating an initial migration.
- **Programmatic Stripe transfers** would let `markPayoutBatchPaid` actually move money and reconcile the result, removing the manual-entry drift. The current code stops at onboarding and leaves the transfer to a human.
- **A real email provider** is half-wired: `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are already read into `env`. Swapping the `console.log` body of `sendTransactionalEmail` for a Resend call is the smallest of the three integrations to finish.

## Related

- [Routes and server actions reference](../reference/routes-and-server-actions.md)
- [Data model reference](../reference/data-model.md)
- [How commissions and referral attribution work](./commission-and-attribution.md)

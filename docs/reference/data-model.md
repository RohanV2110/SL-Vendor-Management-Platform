# Data model reference

This is the complete Prisma data model for the Sugar & Leather vendor/partner portal. It lists every model, its key fields and relations, every enum, and the two state machines that drive the business: the commission ledger and referral attribution.

The schema lives in [`prisma/schema.prisma`](../../prisma/schema.prisma). Seed data lives in [`prisma/seed.ts`](../../prisma/seed.ts).

- **Datasource:** PostgreSQL. The connection string comes from the `DATABASE_URL` environment variable.
- **Client generator:** `prisma-client-js`.
- **Money:** every monetary field is a PostgreSQL `Decimal`. At rest it is a `Prisma.Decimal`. Convert to `Number` only at the presentation or rule-evaluation boundary.
- **Migrations:** there are no migration files. The Docker entrypoint runs `prisma db push`. `npm run prisma:seed` runs `prisma/seed.ts`.

For the "why" behind commissions and attribution, see [../explanation/commission-and-attribution.md](../explanation/commission-and-attribution.md).

## Domain map

The models group into seven domains.

| Domain | Models |
| --- | --- |
| Identity & access | `User` |
| Catalog & tiers | `Product`, `Package`, `Tier`, `TierRule`, `QuestionPrompt` |
| Partner lifecycle | `PartnerApplication`, `ApplicationAnswer`, `PartnerAccount`, `PartnerProfile`, `PartnerInvite` |
| Agreements & documents | `Agreement`, `AgreementDocument` |
| Referrals & deals | `Referral`, `Deal`, `PartnerDeal` |
| Commissions & payouts | `CommissionLedgerEntry`, `PayoutBatch`, `QuarterlyActivitySnapshot` |
| Cross-cutting | `Notification`, `AuditLog`, `InternalNote` |

End-to-end lifecycle: a `PartnerApplication` is reviewed, which spawns a `PartnerAccount` (plus a `PartnerProfile`, a login `User`, a `PartnerInvite`, and NDA + partner-agreement `AgreementDocument` rows). An `Agreement` snapshots the tier terms at activation. The partner submits `Referral` rows; each may produce a `Deal`. On close, `CommissionLedgerEntry` rows are created and flow to a `PayoutBatch`. A `QuarterlyActivitySnapshot` records per-quarter performance.

## Enums

| Enum | Members |
| --- | --- |
| `UserRole` | `ADMIN`, `PARTNER` |
| `PartnerApplicationStatus` | `SUBMITTED`, `UNDER_REVIEW`, `REJECTED`, `APPROVED_PENDING_DOCUMENTS`, `DOCUMENTS_SENT`, `SIGNED_DOCUMENTS_UPLOADED`, `ACTIVE`, `INACTIVE` |
| `PartnerAccountStatus` | `INVITED`, `PENDING_DOCUMENTS`, `PENDING_ACTIVATION`, `ACTIVE`, `INACTIVE` |
| `ReferralStatus` | `SUBMITTED`, `DUPLICATE_NOT_ATTRIBUTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `CONVERTED`, `LOST`, `CLAWED_BACK` |
| `DealStage` | `NEW`, `QUALIFYING`, `PROPOSAL`, `NEGOTIATION`, `CLOSED_WON`, `CLOSED_LOST` |
| `PartnerDealStatus` | `PENDING_APPROVAL`, `APPROVED`, `REJECTED` |
| `PartnerDealStage` | `PROCESSING`, `WON`, `LOST` |
| `CommissionType` | `PERCENTAGE`, `FIXED` |
| `CommissionLedgerStatus` | `PENDING_APPROVAL`, `APPROVED`, `SCHEDULED`, `PAYABLE`, `PAID`, `CLAWED_BACK`, `VOID` |
| `CommissionEntryType` | `UPFRONT`, `TRAILING`, `CLAWBACK`, `ADJUSTMENT` |
| `AgreementStatus` | `DRAFT`, `ACTIVE`, `SUPERSEDED`, `INACTIVE` |
| `AgreementDocumentType` | `NDA`, `PARTNER_AGREEMENT` |
| `AgreementDocumentStatus` | `REQUESTED`, `UPLOADED`, `VERIFIED`, `REJECTED` |
| `PayoutBatchStatus` | `DRAFT`, `READY`, `SUBMITTED`, `PAID`, `FAILED` |
| `QuarterlyActivityStatus` | `MET_THRESHOLD`, `BELOW_THRESHOLD`, `OVERRIDDEN` |
| `NoteEntityType` | `APPLICATION`, `PARTNER`, `REFERRAL`, `DEAL` |

## Identity & access

### `User`

Login accounts for both admins and partners.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `email` | String | `@unique` |
| `passwordHash` | String | bcrypt hash |
| `name` | String | |
| `role` | `UserRole` | |
| `isActive` | Boolean | default `true` |
| `partnerAccountId` | String? | `@unique`; set for partner users, null for admins |

Relations: `partnerAccount` (`PartnerAccount?`), `reviewedApplications` (relation `"ApplicationReviewer"`), `reviewedReferrals` (`"ReferralReviewer"`), `verifiedDocuments` (`"DocumentVerifier"`), `verifiedCommissionEntries` (`"CommissionVerifier"`), `internalNotes`, `auditLogs`, `notifications`.

## Catalog & tiers

### `Product`

The thing a partner sells. Seeded as "Aries AI" (slug `aries-ai`).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `name` | String | |
| `slug` | String | `@unique` |
| `description` | String? | |
| `isActive` | Boolean | |

Relations: `packages`, `tierRules`, `prompts` (`QuestionPrompt`), `applications`, `referrals`, `deals`, `agreements`.

### `Package`

A purchasable bundle under a product. Seeded as "Core Platform" (slug `core-platform`).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `productId` | String | `product` deletes Cascade |
| `name` | String | |
| `slug` | String | |
| `description` | String? | |
| `isActive` | Boolean | |

Constraint: `@@unique([productId, slug])`.

### `Tier`

A partner level (for example Affiliate or Authorized Reseller). The tier links to `TierRule` rows that define commission terms.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `name` | String | |
| `slug` | String | `@unique` |
| `description` | String? | |
| `isDefault` | Boolean | default `false` |
| `isActive` | Boolean | |

Relations: `rules` (`TierRule`), `applications`, `partners`, `agreements`, `snapshots`.

### `TierRule`

The commission terms for a tier, optionally scoped to a product or package. These values get copied onto an `Agreement` at activation.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `tierId` | String | `tier` deletes Cascade |
| `productId` | String? | optional scope |
| `packageId` | String? | optional scope |
| `upfrontCommissionType` | `CommissionType` | |
| `upfrontCommissionValue` | Decimal(10,2) | |
| `trailingCommissionType` | `CommissionType?` | |
| `trailingCommissionValue` | Decimal(10,2)? | |
| `trailingDurationMonths` | Int? | how long trailing runs |
| `trailingCadenceMonths` | Int? | how often trailing pays |
| `clawbackWindowDays` | Int? | |
| `quarterlyApprovedReferralsMin` | Int? | tier threshold |
| `quarterlyConvertedDealsMin` | Int? | tier threshold |
| `quarterlyRevenueMin` | Decimal(12,2)? | tier threshold |
| `quarterlyCommissionMin` | Decimal(12,2)? | tier threshold |
| `isActive` | Boolean | |

Seeded rules:

| Rule | Upfront | Trailing | Duration / cadence | Clawback | Quarterly mins (referrals / deals / revenue / commission) |
| --- | --- | --- | --- | --- | --- |
| `affiliate-default-rule` | 10% | 5% | 12mo / 3mo | 60 days | 1 / 0 / 0 / 0 |
| `reseller-default-rule` | 20% | 10% | 12mo / 3mo | 90 days | 2 / 1 / 10000 / 1000 |

### `QuestionPrompt`

A configurable application question. Three are seeded (`seed-1` through `seed-3`).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `productId` | String? | optional scope |
| `label` | String | |
| `helperText` | String? | |
| `promptType` | String | default `"textarea"` |
| `isRequired` | Boolean | default `true` |
| `sortOrder` | Int | default `0` |
| `isActive` | Boolean | |

Relations: `product?`, `answers` (`ApplicationAnswer`).

## Partner lifecycle

### `PartnerApplication`

A prospective partner's submission. Its `status` walks the `PartnerApplicationStatus` enum.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `fullName` | String | |
| `email` | String | indexed |
| `phone` | String | |
| `company` | String | |
| `country` | String | |
| `city` | String | default `""` |
| `promotionChannels` | String | |
| `aiTechExperience` | String | |
| `audienceDescription` | String | |
| `status` | `PartnerApplicationStatus` | default `SUBMITTED`; indexed |
| `adminNotes` | String? | |
| `submittedAt` | DateTime | |
| `reviewedAt` | DateTime? | |
| `activatedAt` | DateTime? | |
| `productId` | String? | |
| `assignedTierId` | String? | |
| `referredByVendorId` | String? | indexed; partner-to-partner referral source |
| `referralCodeUsed` | String? | indexed |
| `reviewedById` | String? | |

Relations: `product?`, `assignedTier?`, `referredByVendor` (`PartnerAccount?`, relation `"VendorReferredApplications"`, deletes SetNull), `reviewedBy` (`"ApplicationReviewer"`), `partnerAccount?`, `answers`, `notes`.

### `ApplicationAnswer`

One answer to one `QuestionPrompt`, with a snapshot of the prompt text at submission time.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `applicationId` | String | `application` deletes Cascade |
| `questionPromptId` | String | |
| `promptSnapshot` | String | prompt label captured at submit |
| `response` | String | |

### `PartnerAccount`

The active partner record, created from an approved application. This is the hub model: almost everything references it.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `applicationId` | String | `@unique` |
| `tierId` | String | |
| `affiliateId` | String? | `@unique` |
| `vendorReferralCode` | String? | `@unique` |
| `vendorReferralCodeActive` | Boolean | default `false` |
| `vendorReferralCodeGeneratedAt` | DateTime? | |
| `referralClicks` | Int | default `0` |
| `referredByVendorId` | String? | indexed; self-relation parent |
| `referralCodeUsed` | String? | indexed |
| `company` | String | |
| `primaryContactName` | String | |
| `primaryContactEmail` | String | `@unique` |
| `phone` | String | |
| `country` | String | |
| `city` | String | default `""` |
| `status` | `PartnerAccountStatus` | default `INVITED` |
| `stripeAccountId` | String? | |
| `stripeOnboardingComplete` | Boolean | default `false` |
| `activatedAt` | DateTime? | |
| `activationNoticeSeenAt` | DateTime? | |
| `ndaSignedAt` | DateTime? | |
| `ndaMarkedById` | String? | |
| `agreementSignedAt` | DateTime? | |
| `agreementMarkedById` | String? | |

Relations: `application`, `tier`, `referredByVendor` (self-relation `"VendorAffiliates"`, SetNull), `affiliates`, `referredApplications`, `profile?`, `agreements`, `user?`, `inviteTokens`, `referrals`, `deals`, `partnerDeals`, `commissions`, `snapshots`, `payoutBatches`, `notifications`, `documents`, `notes`.

### `PartnerProfile`

Extended profile data for a partner account.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `partnerAccountId` | String | `@unique`; deletes Cascade |
| `promotionChannels` | String | |
| `aiTechExperience` | String | |
| `audienceDescription` | String | |
| `companyWebsite` | String? | |

### `PartnerInvite`

A single-use, expiring invite token for partner onboarding.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `partnerAccountId` | String | deletes Cascade |
| `email` | String | |
| `token` | String | `@unique` |
| `expiresAt` | DateTime | |
| `usedAt` | DateTime? | |

## Agreements & documents

### `Agreement`

A versioned commercial agreement. It copies the tier terms from `TierRule` so the partner's economics are frozen even if the tier later changes. Its `status` walks the `AgreementStatus` enum.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `partnerAccountId` | String | deletes Cascade |
| `tierId` | String | |
| `productId` | String? | |
| `packageId` | String? | |
| `name` | String | |
| `version` | Int | default `1` |
| `status` | `AgreementStatus` | default `DRAFT` |
| `effectiveStartDate` | DateTime | |
| `effectiveEndDate` | DateTime? | |
| `upfrontCommissionType` | `CommissionType?` | snapshot of tier term |
| `upfrontCommissionValue` | Decimal(10,2)? | snapshot |
| `trailingCommissionType` | `CommissionType?` | snapshot |
| `trailingCommissionValue` | Decimal(10,2)? | snapshot |
| `trailingDurationMonths` | Int? | snapshot |
| `trailingCadenceMonths` | Int? | snapshot |
| `clawbackWindowDays` | Int? | snapshot |
| `quarterlyApprovedReferralsMin` | Int? | snapshot |
| `quarterlyConvertedDealsMin` | Int? | snapshot |
| `quarterlyRevenueMin` | Decimal(12,2)? | snapshot |
| `quarterlyCommissionMin` | Decimal(12,2)? | snapshot |

Relations: `partnerAccount` (Cascade), `tier`, `product?`, `package?`, `documents`, `commissionEntries`. Index: `[partnerAccountId, status]`.

### `AgreementDocument`

An NDA or partner-agreement file tied to a partner account, optionally linked to a specific `Agreement`. Its `status` walks the `AgreementDocumentStatus` enum.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `partnerAccountId` | String | deletes Cascade |
| `agreementId` | String? | deletes SetNull |
| `type` | `AgreementDocumentType` | |
| `status` | `AgreementDocumentStatus` | default `REQUESTED` |
| `fileName` | String? | |
| `fileUrl` | String? | |
| `requestedAt` | DateTime | |
| `uploadedAt` | DateTime? | |
| `verifiedAt` | DateTime? | |
| `verifiedById` | String? | |

Relations: `partnerAccount` (Cascade), `agreement?` (SetNull), `verifiedBy` (`"DocumentVerifier"`). Constraint: `@@unique([partnerAccountId, type])` (one NDA and one partner agreement per account).

## Referrals & deals

The portal has two distinct deal models. `Referral` plus `Deal` is the admin-managed referral pipeline. `PartnerDeal` is a separate self-service deal that partners register directly.

### `Referral`

A lead a partner submits. Deduplication uses `normalizedLeadKey`: the first referral to a lead wins attribution; later duplicates get status `DUPLICATE_NOT_ATTRIBUTED`. The dedupe logic lives in code (`src/lib/rules.ts`), not in the schema. The schema provides the enum member, the `isAttributed` flag, and the `normalizedLeadKey` index. Status walks the `ReferralStatus` enum.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `partnerAccountId` | String | deletes Cascade |
| `productId` | String | |
| `packageId` | String? | |
| `referredCompany` | String | |
| `referredContactName` | String | |
| `referredContactEmail` | String? | |
| `referredDomain` | String? | |
| `normalizedLeadKey` | String | indexed; dedupe key |
| `sourceNotes` | String | |
| `useCaseSummary` | String | |
| `estimatedDealValue` | Decimal(12,2)? | |
| `attachmentName` | String? | |
| `attachmentUrl` | String? | |
| `status` | `ReferralStatus` | default `SUBMITTED`; indexed |
| `isAttributed` | Boolean | default `false` |
| `reviewReason` | String? | |
| `adminNotes` | String? | |
| `reviewedById` | String? | |
| `submittedAt` | DateTime | |
| `approvedAt` | DateTime? | |

Relations: `partnerAccount` (Cascade), `product`, `package?`, `reviewedBy` (`"ReferralReviewer"`), `deal` (`Deal?`), `commissionEntries`, `notes`. Indexes: `normalizedLeadKey`, `status`, `[partnerAccountId, submittedAt]`.

### `Deal`

A sales opportunity created from an approved referral. One referral maps to at most one deal. Stage walks the `DealStage` enum.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `referralId` | String | `@unique`; deletes Cascade |
| `partnerAccountId` | String | deletes Cascade |
| `productId` | String | |
| `packageId` | String? | |
| `stage` | `DealStage` | default `NEW`; indexed |
| `ownerName` | String | |
| `expectedValue` | Decimal(12,2)? | |
| `closedValue` | Decimal(12,2)? | |
| `closeDate` | DateTime? | |
| `summaryNotes` | String? | |

Relations: `referral` (Cascade), `partnerAccount` (Cascade), `product`, `package?`, `commissionEntries`, `notes`.

### `PartnerDeal`

A deal a partner registers directly through the portal. It carries its own approval status (`PartnerDealStatus`) and progress stage (`PartnerDealStage`). It is independent of `Referral` and `Deal`.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `partnerAccountId` | String | deletes Cascade |
| `name` | String | |
| `email` | String | indexed |
| `companyName` | String | |
| `website` | String? | |
| `phoneCountryCode` | String? | |
| `phoneNumber` | String? | |
| `country` | String | |
| `state` | String | |
| `notes` | String? | |
| `dealValue` | Decimal(12,2)? | |
| `status` | `PartnerDealStatus` | default `PENDING_APPROVAL`; indexed |
| `stage` | `PartnerDealStage` | default `PROCESSING`; indexed |
| `trailingStoppedAt` | DateTime? | |
| `reviewedAt` | DateTime? | |
| `reviewedById` | String? | |
| `rejectionReason` | String? | |

Relations: `partnerAccount` (Cascade), `commissionEntries`. Indexes: `partnerAccountId`, `status`, `stage`, `email`.

## Commissions & payouts

### `CommissionLedgerEntry`

One commission line. It can attach to a `Referral`, a `Deal`, or a `PartnerDeal`, but it always references an `Agreement` (the source of the rate). Self-relation `parentEntry`/`clawbackEntries` links a clawback to the entry it reverses. The `type` field is a `CommissionEntryType`; the `status` field walks the `CommissionLedgerStatus` machine described below.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `partnerAccountId` | String | deletes Cascade |
| `referralId` | String? | deletes SetNull |
| `dealId` | String? | deletes SetNull |
| `partnerDealId` | String? | deletes SetNull |
| `agreementId` | String | required |
| `payoutBatchId` | String? | deletes SetNull |
| `parentEntryId` | String? | self-relation `"ClawbackParent"`, SetNull |
| `type` | `CommissionEntryType` | `UPFRONT`, `TRAILING`, `CLAWBACK`, `ADJUSTMENT` |
| `status` | `CommissionLedgerStatus` | default `PENDING_APPROVAL` |
| `amount` | Decimal(12,2) | |
| `currency` | String | default `"USD"` |
| `percentageApplied` | Decimal(10,2)? | rate used, if percentage-based |
| `scheduledFor` | DateTime? | |
| `payableAt` | DateTime? | |
| `paidAt` | DateTime? | |
| `trailingVerifiedAt` | DateTime? | |
| `trailingVerifiedById` | String? | |
| `stripePayoutId` | String? | |
| `description` | String | |

Relations: `partnerAccount` (Cascade), `referral?` (SetNull), `deal?` (SetNull), `partnerDeal?` (SetNull), `agreement` (required), `payoutBatch?` (SetNull), `parentEntry`/`clawbackEntries` (self-relation `"ClawbackParent"`, SetNull), `trailingVerifiedBy` (`"CommissionVerifier"`, SetNull). Indexes: `[partnerAccountId, status]`, `[partnerDealId, type]`.

### `PayoutBatch`

A bundle of payable commission entries paid out together. Status walks the `PayoutBatchStatus` enum.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `partnerAccountId` | String | deletes Cascade |
| `label` | String | |
| `status` | `PayoutBatchStatus` | default `DRAFT` |
| `scheduledAt` | DateTime? | |
| `submittedAt` | DateTime? | |
| `paidAt` | DateTime? | |
| `stripePayoutId` | String? | |
| `notes` | String? | |

Relations: `partnerAccount` (Cascade), `commissionEntries`.

### `QuarterlyActivitySnapshot`

A computed per-quarter performance record for a partner at a tier. Status is `QuarterlyActivityStatus` (no default; it is set when the snapshot is computed).

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `partnerAccountId` | String | deletes Cascade |
| `tierId` | String | |
| `year` | Int | |
| `quarter` | Int | |
| `approvedReferrals` | Int | default `0` |
| `convertedDeals` | Int | default `0` |
| `revenueAmount` | Decimal(12,2) | default `0` |
| `commissionAmount` | Decimal(12,2) | default `0` |
| `status` | `QuarterlyActivityStatus` | `MET_THRESHOLD`, `BELOW_THRESHOLD`, or `OVERRIDDEN` |
| `overrideNote` | String? | |
| `computedAt` | DateTime | |

Relations: `partnerAccount` (Cascade), `tier`. Constraint: `@@unique([partnerAccountId, year, quarter])`.

## Cross-cutting

### `Notification`

An in-app notification for either a partner account or a user.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `partnerAccountId` | String? | deletes Cascade |
| `userId` | String? | deletes Cascade |
| `title` | String | |
| `body` | String | |
| `href` | String? | |
| `readAt` | DateTime? | |

### `AuditLog`

An append-only record of state changes, with before/after JSON snapshots.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `actorUserId` | String? | deletes SetNull |
| `entityType` | String | |
| `entityId` | String | |
| `action` | String | |
| `summary` | String | |
| `previousState` | Json? | |
| `nextState` | Json? | |

Relation: `actorUser?` (SetNull). Index: `[entityType, entityId]`.

### `InternalNote`

An admin note attached to one of four entity types. The `entityType` is a `NoteEntityType`, and the matching foreign key (`applicationId`, `referralId`, `dealId`, or `partnerAccountId`) is set.

| Field | Type | Notes |
| --- | --- | --- |
| `id` | String | Primary key |
| `entityType` | `NoteEntityType` | `APPLICATION`, `PARTNER`, `REFERRAL`, `DEAL` |
| `entityId` | String | |
| `partnerAccountId` | String? | deletes Cascade |
| `applicationId` | String? | deletes Cascade |
| `referralId` | String? | deletes Cascade |
| `dealId` | String? | deletes Cascade |
| `body` | String | |
| `authorId` | String | required |

Relations: `author` (`User`, required), `partnerAccount?` (Cascade), `application?` (Cascade), `referral?` (Cascade), `deal?` (Cascade).

## State machine: commission ledger

`CommissionLedgerEntry.status` moves through the `CommissionLedgerStatus` enum. The happy path:

```
PENDING_APPROVAL -> APPROVED -> SCHEDULED -> PAYABLE -> PAID
```

Once an entry reaches `PAYABLE`, it is bundled into a `PayoutBatch` (via `payoutBatchId`) and paid out together with other entries for that partner. Two terminal states sit outside the happy path:

- `CLAWED_BACK`: the commission was reversed. A separate `CommissionLedgerEntry` of type `CLAWBACK` is created and linked back through `parentEntryId` (self-relation `"ClawbackParent"`).
- `VOID`: the entry was cancelled before payout.

Entry types (`CommissionEntryType`):

| Type | Meaning |
| --- | --- |
| `UPFRONT` | One-time commission when a deal closes |
| `TRAILING` | Recurring commission paid on a cadence (`trailingCadenceMonths`) for a duration (`trailingDurationMonths`) |
| `CLAWBACK` | Reversal of a prior entry within `clawbackWindowDays` |
| `ADJUSTMENT` | Manual correction |

## State machine: referral attribution

A `Referral` is deduplicated by `normalizedLeadKey`. The first referral to reach a given lead wins attribution (`isAttributed = true`). Later submissions for the same lead are recorded with status `DUPLICATE_NOT_ATTRIBUTED` and never earn commission. The attribution decision is enforced in application code (`src/lib/rules.ts`), not by a database constraint.

`ReferralStatus` flow:

```
SUBMITTED -> UNDER_REVIEW -> APPROVED -> CONVERTED
                          \-> REJECTED
SUBMITTED -> DUPLICATE_NOT_ATTRIBUTED   (loses to an earlier referral)
APPROVED/CONVERTED -> LOST              (deal did not close)
CONVERTED -> CLAWED_BACK                (commission reversed)
```

## Examples

### Read all payable commission entries for a partner, with their agreement rate

```ts
import { PrismaClient, CommissionLedgerStatus } from "@prisma/client";

const prisma = new PrismaClient();

const payable = await prisma.commissionLedgerEntry.findMany({
  where: {
    partnerAccountId: "partner-123",
    status: CommissionLedgerStatus.PAYABLE,
  },
  include: { agreement: true },
});

// amount is a Prisma.Decimal at rest; convert only at the boundary.
const total = payable.reduce((sum, e) => sum + Number(e.amount), 0);
```

### Find duplicate referrals that lost attribution for a lead key

```ts
import { PrismaClient, ReferralStatus } from "@prisma/client";

const prisma = new PrismaClient();

const duplicates = await prisma.referral.findMany({
  where: {
    normalizedLeadKey: "acme-corp|acme.com",
    status: ReferralStatus.DUPLICATE_NOT_ATTRIBUTED,
  },
  select: { id: true, partnerAccountId: true, submittedAt: true },
  orderBy: { submittedAt: "asc" },
});
```

### Seed the database

```bash
npm run prisma:generate
npm run prisma:seed
```

After seeding you can sign in as the admin: email `admin@sugarleather.ai`, password `Admin123!`. The seed also creates the "Aries AI" product, a "Core Platform" package, the "Affiliate" and "Authorized Reseller" tiers with their default rules, three question prompts, and a sample application, partner account, and agreement.

## Related

- [How commissions and referral attribution work](../explanation/commission-and-attribution.md)
- [Routes and server actions reference](./routes-and-server-actions.md)
- [Architecture and design decisions](../explanation/architecture.md)

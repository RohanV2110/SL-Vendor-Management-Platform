# How commissions and referral attribution work

Two partners refer the same lead. The deal closes. Who gets paid? Later, finance restates a quarter and a commission that was already paid turns out to be wrong. How do you reverse it without losing the record that it happened?

Sugar & Leather answers both questions with one design choice: money is an **append-only ledger**, not a mutable balance. Every commission is a row. Reversals are new rows. Attribution is decided once, at submission time, and never silently changes. This page explains why the model is built this way, what it buys you, and what it costs.

## The problem without this design

Imagine commissions stored as a single `amount` column on each deal, edited in place.

- Two partners submit the same company. Both look valid. Without a rule that fires at submission, the conflict surfaces later, at payout, when money is on the line and the data no longer tells you who was first.
- A trailing commission gets paid, then the customer churns inside the clawback window. You edit the deal's `amount` down. The audit question "what did we pay, and when, and why did it change?" now has no answer. The old value is gone.
- A quarter closes. A partner disputes whether they hit their tier threshold. You recompute from live data that has shifted since the quarter ended. You cannot reproduce the number you reported.

Each failure is the same root cause: state that changes in place loses history. The ledger design refuses to overwrite. That is the whole idea.

## The approach

### Attribution is decided once, at submission

When a referral comes in, [`createReferral`](../reference/routes-and-server-actions.md) computes a `normalizedLeadKey` from the company, email, and domain (via `normalizeLeadKey` in `@/lib/utils`). It then asks one question: does an already-attributed referral exist for this key?

```ts
const existingAttributed = await tx.referral.findFirst({
  where: { normalizedLeadKey, isAttributed: true }
});
const { isAttributed, status } = deriveReferralSubmissionStatus(Boolean(existingAttributed));
```

The decision lives in a pure function, [`deriveReferralSubmissionStatus`](../reference/data-model.md). First submission wins: `isAttributed = true`, status `SUBMITTED`. Every later submission for the same key becomes `DUPLICATE_NOT_ATTRIBUTED` with `isAttributed = false`. A duplicate can never be approved later: `reviewReferral` throws `"Duplicate referrals cannot be approved."` if it sees that status.

First-attribution-wins is a policy, not an accident of timing at payout. It is recorded on the row the moment the referral lands.

The affiliate path adds one more guard. `recordAriesAffiliateSignup` first looks for the earliest referral by `referredContactEmail` (ordered `createdAt asc`); if one exists it returns `{ alreadyRecorded: true }` and stops. Only if none exists does it fall through to the same `normalizedLeadKey` / `isAttributed` rule.

### Tier rules carry the commission terms

A `TierRule` holds the commission math and the quarterly bar. Upfront terms (`upfrontCommissionType`, `upfrontCommissionValue`) are required. Trailing terms (`trailingCommissionType`, `trailingCommissionValue`, `trailingDurationMonths`, `trailingCadenceMonths`) and `clawbackWindowDays` are optional. So are the four quarterly minimums. Rules can be scoped to a `productId` or `packageId`. Field-level detail is in [the data model reference](../reference/data-model.md).

When an agreement activates, it **snapshots** these columns. The `Agreement` carries the same commission and threshold fields. That snapshot is why a partner's pay terms do not change under them when an admin later edits the tier: ledger generation reads the agreement first, with the tier rule as fallback (`agreement.X ?? tierRule.X`).

### Deal close turns into ledger rows

There are two close paths, and they are not the same.

**Referral deals.** `upsertDeal` only accepts referrals already in `APPROVED`, `CONVERTED`, or `LOST`. On `CLOSED_WON` it sets the referral to `CONVERTED` and calls the private `generateCommissionLedgerEntries`. On `CLOSED_LOST` it sets the referral to `LOST` and stops.

`generateCommissionLedgerEntries` is guarded twice: it returns early unless `deal.stage === CLOSED_WON` and `deal.closedValue` is set, and it aborts if any entry already exists for the deal (`count > 0`). That second guard is the idempotency lock; re-closing a deal does not double-pay. It then:

- Creates one `UPFRONT` entry at status **`APPROVED`** with `payableAt = now`. The amount comes from `calculateCommissionAmount(Number(deal.closedValue), upfrontType, Number(upfrontValue))`. `percentageApplied` is set only when the type is `PERCENTAGE`.
- Creates trailing entries only when `trailingType && trailingValue && trailingDuration > 0 && trailingCadence > 0`. The count is `Math.floor(trailingDuration / trailingCadence)`. Each is `SCHEDULED`, with `scheduledFor` set to the close date plus `trailingCadence * (index + 1)` months. `trailingDuration` and `trailingCadence` fall back to `0` when null, which disables trailing.

**Partner deals.** `syncPartnerDealCommissionsFromStage` is the parallel path, keyed on `partnerDealId` and `PartnerDealStage`. On `LOST` or `PROCESSING` it calls `voidPartnerDealCommissions`, which sets status `VOID` on every entry that is not already `PAID`. On `WON` it requires `status === APPROVED` (`"Approve the deal before marking it Won."`) and `dealValue > 0`, voids any existing entries, then creates the `UPFRONT` entry at status **`PENDING_APPROVAL`** (not `APPROVED`), plus trailing entries gated additionally on `!deal.trailingStoppedAt`.

The divergence is deliberate to know about: a referral-deal upfront lands ready to schedule, a partner-deal upfront lands needing a human approval step.

```
                          TIER RULE / AGREEMENT
                  (upfront + trailing terms, thresholds)
                                  |
            snapshot at activation v
        +-------------------------------------------------+
        |                                                 |
   REFERRAL DEAL path                          PARTNER DEAL path
   upsertDeal (CLOSED_WON)                 syncPartnerDealCommissionsFromStage (WON)
        |                                                 |
        v                                                 v
   generateCommissionLedgerEntries              voids non-PAID, then creates
        |                                                 |
        v                                                 v
   UPFRONT  -> status APPROVED                  UPFRONT  -> status PENDING_APPROVAL
   TRAILING -> status SCHEDULED (N rows)        TRAILING -> status SCHEDULED (N rows)
        |                                                 |
        +-----------------------+-------------------------+
                                v
                    CommissionLedgerEntry rows
            (append-only; clawbacks + voids are new/updated rows)
                                |
                                v
        updateCommissionStatus / createPayoutBatch / markPayoutBatchPaid
                                |
                                v
                          PayoutBatch -> PAID (Stripe)
```

### The ledger "state machine" is a convention, not a guard

The intended path for an entry is `PENDING_APPROVAL -> APPROVED -> SCHEDULED -> PAYABLE -> PAID`. The enum `CommissionLedgerStatus` has seven values, though, including `CLAWED_BACK` and `VOID`, and the code does not enforce the order:

- `updateCommissionStatus` sets **any** status you pass. It stamps `payableAt = now` when the target is `PAYABLE` and `paidAt = now` when it is `PAID`, and writes a `commission.status_changed` audit row. There is no transition table rejecting a backward or illegal move.
- `createCommissionEntry` rejects amounts `<= 0` or non-finite and rejects type `CLAWBACK` (`"Use the clawback flow"`). It defaults new entries to `APPROVED`.
- `createClawback` is the reversal flow. It writes a **new** `CLAWBACK` entry with `status: CLAWED_BACK`, `amount = Number(entry.amount) * -1`, and `parentEntryId` pointing at the original (the `ClawbackParent` self-relation). The original row is left intact. If the original carried a `referralId`, that referral is set to `CLAWED_BACK`.
- `verifyTrailingCommission` toggles `trailingVerifiedAt` / `trailingVerifiedById` and only accepts `TRAILING` entries.
- `stopPartnerDealTrailingCommissions` sets `partnerDeal.trailingStoppedAt` and voids (`VOID`) the `TRAILING` entries still in `SCHEDULED`.

Payout batching:

- `createPayoutBatch` requires `partner.stripeOnboardingComplete` (`"Partner must complete Stripe onboarding before payout."`). It creates a `PayoutBatch` at status `READY` with `scheduledAt = now`, then `updateMany`s the given `entryIds` (scoped to the partner) to `payoutBatchId`, status `PAYABLE`, `payableAt = now`.
- `markPayoutBatchPaid` sets the batch to `PAID` with `submittedAt` / `paidAt = now` and a `stripePayoutId`, and updates every entry in the batch to `PAID` with the same `paidAt` and `stripePayoutId`.

See [Record a payout](../how-to/record-a-payout.md) for the operator steps.

### Quarterly thresholds are evaluated, not stored as truth

`refreshQuarterlyActivity(partnerAccountId, date = new Date())` recomputes a quarter from live data and snapshots the verdict. It derives `year` (UTC) and `quarter` via `getQuarter(date)`, then gathers four metrics over `[startOfQuarter, endOfQuarter]`:

- `approvedReferrals`: referrals with status in `[APPROVED, CONVERTED]` whose `approvedAt` is in the quarter.
- `convertedDeals`: deals `CLOSED_WON` with `closeDate` in the quarter.
- `revenueAmount`: sum of those deals' `closedValue`.
- `commissionAmount`: sum of ledger entry `amount` with `createdAt` in the quarter and status `!= VOID`.

It passes these to [`evaluateQuarterlyActivity`](../reference/data-model.md), a pure AND of four `>=` checks where each null threshold is treated as `0` via `?? 0`. The result upserts a `QuarterlyActivitySnapshot` (unique on `[partnerAccountId, year, quarter]`) at status `MET_THRESHOLD` or `BELOW_THRESHOLD`. Below threshold fires partner and admin notifications.

Note: although `QuarterlyActivityStatus.OVERRIDDEN` and `snapshot.overrideNote` exist in the schema, no code path writes them today. `refreshQuarterlyActivity` only ever sets `MET_THRESHOLD` or `BELOW_THRESHOLD`; the override value and column are defined but unused, reserved for a manual override that is not yet built.

## Trade-offs

The ledger is not free. Here is what was given up to get auditability.

- **Two divergent code paths.** `generateCommissionLedgerEntries` (referral deals) and `syncPartnerDealCommissionsFromStage` (partner deals) duplicate the same upfront/trailing math and disagree on the initial status (`APPROVED` vs `PENDING_APPROVAL`). Two places to change when the commission logic changes. Two places for them to drift apart.
- **The state machine is by convention only.** `updateCommissionStatus` writes arbitrary statuses. The intended order is documented and followed, not enforced in code. A bad call can move an entry to any state. The audit log catches it after the fact; nothing prevents it up front.
- **Trailing schedules are materialized up front.** Closing a won deal writes `Math.floor(trailingDuration / trailingCadence)` `SCHEDULED` rows immediately, rather than computing the schedule on demand. More rows, and a change to cadence after close means reconciling rows that already exist (the partner-deal path handles this by voiding and recreating).
- **Reversals add rows, they do not remove them.** Clawbacks are negative-amount siblings linked by `parentEntryId`; stops and losses set `VOID`. A partner's true balance is a sum across statuses, never a single field. Reading "what do we owe" always means filtering and summing, never reading one number.
- **Money lives as `Prisma.Decimal` at rest** and is converted to `Number` only at the rule-evaluation and presentation boundary (a project convention). That keeps stored money exact but means every calculation site has to convert deliberately, and a missed conversion is a bug waiting to happen.

What you get in return: nearly every mutation writes an `AuditLog` row (with `previousState` / `nextState`) inside the same `prisma.$transaction`. You can reconstruct who changed what, when, and from what. For a system that moves money, that reconstructability is the point, and it is why the append-only cost is worth paying here.

## Alternatives considered

The natural alternative is a **mutable balance**: one editable amount per deal or per partner, updated in place. It is simpler to read (one number) and needs no batching or status enum. It loses history on every edit, cannot reproduce a restated quarter, and turns a churned-customer clawback into silent data loss. The ledger trades that simplicity for a record you can audit and replay. Given real money and real disputes, that is the trade this codebase makes.

The thresholds could likewise be **stored as a running counter** instead of recomputed. The code recomputes from source rows each time (`refreshQuarterlyActivity`) and snapshots the verdict, so a stale counter can never drift from reality; the snapshot is a cache of a derivable fact, not the fact itself.

## Verify it yourself

The pure helpers have a unit test:

```bash
npx vitest run tests/rules.test.ts
```

## Related

- [Data model reference](../reference/data-model.md)
- [How to record a partner payout](../how-to/record-a-payout.md)
- [Architecture and design decisions](./architecture.md)

# How to record a partner payout

Move approved commission entries into a payout batch, pay the partner off-platform, then record that payment so the ledger and the partner's earnings page agree.

This is an admin task. The app does not move money. Stripe Connect in this codebase only onboards a partner's bank details (Connect Express, onboarding links). You send the actual funds yourself (bank transfer, Stripe dashboard, or whatever you use), then come back and mark the batch paid.

## Prerequisites

- An **ADMIN** account. Every action below calls `requireRole("ADMIN")` in `src/lib/actions.ts` and will reject non-admins.
- The partner must have completed Stripe onboarding. `createPayoutBatch` in `src/lib/services/platform.ts` throws `"Partner must complete Stripe onboarding before payout."` if `partner.stripeOnboardingComplete` is false. See [how to onboard a partner](./onboard-a-partner.md).
- At least one commission ledger entry for that partner in status `APPROVED` or `PAYABLE` that is not already attached to a batch (`payoutBatchId: null`). The payouts page only lists those.

### Ledger states this task touches

A commission ledger entry (`CommissionLedgerEntry`) carries a `CommissionLedgerStatus`. The payout path uses three of them:

- `APPROVED` - the entry is cleared to be paid. Entries from won deals get here after admin review; manually created entries default to `APPROVED` (`createCommissionEntry` in `src/lib/services/platform.ts`).
- `PAYABLE` - the entry has been put into a payout batch and is waiting for payment.
- `PAID` - the payment has been recorded.

So the payout path is `APPROVED -> PAYABLE -> PAID`.

`SCHEDULED` is **not** a step in this path. It marks future-dated trailing commissions and is one of the manual status options; an entry can sit in `SCHEDULED` before it ever reaches `APPROVED`, but creating a batch never produces or consumes `SCHEDULED`.

## Steps

### 1. Approve the entries you want to pay

Open `/admin/commissions`. Each row has a status dropdown wired to `updateCommissionStatusAction` (`src/lib/actions.ts`). The dropdown (`statusTargets` in `src/app/admin/commissions/page.tsx`) offers exactly:

```
APPROVED, SCHEDULED, PAYABLE, PAID, VOID
```

Set the entry to `APPROVED` and click **Update**.

Expected result: `updateCommissionStatus` writes the new status. When you move an entry to `PAYABLE` it stamps `payableAt`; when you move it to `PAID` it stamps `paidAt`. The page revalidates `/admin/commissions` and `/partner/earnings`.

You can skip this step for entries that are already `APPROVED` (the default for manual entries and for cleared deal commissions).

To add a one-off entry instead, use the "Add commission" dialog, which posts to `createCommissionAction`. Allowed manual statuses are exactly `APPROVED, SCHEDULED, PAYABLE, PAID`; allowed types are `UPFRONT, TRAILING, ADJUSTMENT`. Amount must be a finite number greater than zero, and a description is required.

### 2. Open the payouts page

Go to `/admin/payouts`. The page loads every ledger entry where `status` is in `[APPROVED, PAYABLE]` **and** `payoutBatchId` is `null`, then groups them by partner (`src/app/admin/payouts/page.tsx`). Each partner gets one "Create payout batches" form.

Expected result: under "Create payout batches" you see one card per partner with un-batched payout-ready entries, showing the entry count and total amount. If there are none, you see "No payout-ready entries without a batch."

### 3. Create the payout batch

In the partner's card, the form already holds the hidden `partnerAccountId` and one hidden `entryIds` input per entry. Edit the **Batch label** field if you want (it defaults to `<company> payout`), then click **Create payout batch**.

The form posts to `createPayoutBatchAction`, which validates against `payoutBatchSchema` (`src/lib/validators/platform.ts`):

```
partnerAccountId: z.string().min(1)
entryIds:         z.array(z.string().min(1)).min(1)   // at least one entry
label:            z.string().min(2)                   // at least two characters
```

Expected result: `createPayoutBatch` creates a `PayoutBatch` with `status: READY` and `scheduledAt: now`, then sets every selected entry to `payoutBatchId = <batch id>`, `status: PAYABLE`, `payableAt: now`. Batching forces the entries to `PAYABLE` regardless of their prior status. The page revalidates `/admin/payouts` and `/admin/commissions`. The new batch appears under "Existing payout batches" with a `READY` badge.

### 4. Pay the partner off-platform

Send the money yourself. The app has no step that transfers funds. Stripe Connect here is onboarding-only: `provisionConnectAccount` and `createConnectOnboardingLink` (`src/lib/stripe.ts`) create an `express` account and an `account_onboarding` link to collect bank details, and neither moves money.

Record the payment reference (for example a Stripe payout id like `po_...`) so you can paste it in the next step.

### 5. Mark the batch paid

Back on `/admin/payouts`, find the batch under "Existing payout batches". For any batch whose status is not `PAID`, the card shows a **Stripe payout ID** field (placeholder `po_xxx (optional)`) and a **Mark batch paid** button. Optionally paste the payout reference, then click **Mark batch paid**.

The form posts to `markPayoutBatchPaidAction`, which reads `batchId` (required) and `stripePayoutId` (optional) and calls `markPayoutBatchPaid`.

Expected result: `markPayoutBatchPaid` sets the batch to `status: PAID` with `submittedAt`, `paidAt`, and `stripePayoutId`, then sets every entry in the batch to `status: PAID`, `paidAt: now`, and the same `stripePayoutId`. It creates a partner notification titled "Payout sent" linking to `/partner/earnings`. It does **not** call Stripe; `stripePayoutId` is stored only as a reference string. The page revalidates `/admin/payouts` and `/partner/earnings`.

## Verification

- On `/admin/payouts`, the batch now shows a `PAID` badge and a "Paid" timestamp, and its mark-paid form is gone.
- On `/admin/commissions`, each entry you batched now shows status `PAID`.
- The partner sees the "Payout sent" notification and the updated totals on `/partner/earnings`.
- If you recorded a `stripePayoutId`, it is now stored on both the `PayoutBatch` and every entry in it.

## Troubleshooting

**"Partner must complete Stripe onboarding before payout."**
`createPayoutBatch` throws this when `partner.stripeOnboardingComplete` is false. The partner has to finish Stripe Connect onboarding first. See [how to onboard a partner](./onboard-a-partner.md).

**The partner is missing from the payouts page.**
The page only lists entries that are `APPROVED` or `PAYABLE` and not already in a batch. If every entry is still `PENDING_APPROVAL`, `SCHEDULED`, `VOID`, or already batched, the partner will not appear. Approve at least one entry on `/admin/commissions` (Step 1).

**"Invalid payout batch." on submit.**
`createPayoutBatchAction` throws the first `payoutBatchSchema` error. Causes: no entries selected (`entryIds` needs at least one), or a label shorter than two characters. Make sure the label has two or more characters and at least one entry is included.

**"Partner not found."**
`createPayoutBatch` throws this when `partnerAccountId` does not match a `PartnerAccount`. The partner record was likely deleted or the id is wrong.

**"Stripe Connect is not configured."**
`startStripeOnboardingAction` and `confirmStripeOnboardingAction` throw this when `STRIPE_SECRET_KEY` is unset. This blocks the onboarding actions, not the payout steps. Note a subtlety: the underlying lib functions `provisionConnectAccount` and `createConnectOnboardingLink` do **not** throw when the key is missing; they return stub data (`stub_<name>` account id, a `?stripe=stub` URL). Onboarding looks blocked only because the actions guard on the key before calling those functions.

**Stripe-related env vars.** `STRIPE_SECRET_KEY` (no default; absence disables the Stripe client and the onboarding actions), `APP_BASE_URL` (default `http://localhost:3000`), `STRIPE_CONNECT_REFRESH_URL` and `STRIPE_CONNECT_RETURN_URL` (both default to `http://localhost:3000/partner/dashboard`). All in `src/lib/env.ts`.

**Need to reverse a paid entry.**
There is no "un-pay" action. To claw back commission, use the per-row clawback form on `/admin/commissions`, which posts to `createClawbackAction` with a required `reason`. It is available on any entry whose type is not `CLAWBACK`.

## Related

- [How commissions and referral attribution work](../explanation/commission-and-attribution.md)
- [Data model reference](../reference/data-model.md)

# Routes and server actions reference

This is the surface a developer touches in the Sugar & Leather partner portal: page routes, the three API routes, and the server actions in `src/lib/actions.ts`. The server actions are this app's mutation API. There is no REST/GraphQL layer for writes. Forms call server actions directly.

Three concepts run through everything:

- **Role guards** live in `src/lib/auth-helpers.ts`. Pages and actions call them at the top.
- **Zod schemas** live in `src/lib/validators/platform.ts`. There are 7 of them; 8 actions use one (`tierSchema` is shared by two). The rest validate fields by hand.
- **Service functions** in `src/lib/services/platform.ts` do the data work. Actions parse input, call a service, then `revalidatePath(...)` and/or `redirect(...)`.

## Role guards

From `src/lib/auth-helpers.ts`. Each is `async` and returns a value, or redirects and never returns.

| Guard | Returns | Redirects when |
| --- | --- | --- |
| `requireUser()` | `session.user` | `redirect("/login")` if no session |
| `requireRole(role)` | `session.user` | `redirect(user.role === "ADMIN" ? "/admin" : "/partner/dashboard")` if `user.role !== role` |
| `requirePartnerAccountId()` | partner account `id` (string) | calls `requireRole("PARTNER")`; `redirect("/apply")` if the user has no `partnerAccountId` or the `partnerAccount` row is missing |

`role` is `"ADMIN" | "PARTNER"`.

## Page routes

Source: `page.tsx` files under `src/app`. The guard column shows what the page (or the actions it renders) calls. Public pages have no guard in source.

### Public

| Route | File | Guard |
| --- | --- | --- |
| `/` | `src/app/page.tsx` | none |
| `/apply` | `src/app/(public)/apply/page.tsx` | none |
| `/login` | `src/app/login/page.tsx` | none |
| `/login/setup` | `src/app/login/setup/page.tsx` | none |

### Partner

Guarded with `requireRole("PARTNER")` and/or `requirePartnerAccountId()`.

| Route | File |
| --- | --- |
| `/partner` | `src/app/partner/page.tsx` |
| `/partner/dashboard` | `src/app/partner/dashboard/page.tsx` |
| `/partner/activity` | `src/app/partner/activity/page.tsx` |
| `/partner/affiliates` | `src/app/partner/affiliates/page.tsx` |
| `/partner/documents` | `src/app/partner/documents/page.tsx` |
| `/partner/earnings` | `src/app/partner/earnings/page.tsx` |
| `/partner/referrals` | `src/app/partner/referrals/page.tsx` |

### Admin

Guarded with `requireRole("ADMIN")`. The admin dashboard is the root `/admin`. There is no `/admin/dashboard` segment.

| Route | File |
| --- | --- |
| `/admin` | `src/app/admin/page.tsx` |
| `/admin/partners` | `src/app/admin/partners/page.tsx` |
| `/admin/partners/[id]` | `src/app/admin/partners/[id]/page.tsx` |
| `/admin/deals` | `src/app/admin/deals/page.tsx` |
| `/admin/commissions` | `src/app/admin/commissions/page.tsx` |
| `/admin/payouts` | `src/app/admin/payouts/page.tsx` |
| `/admin/referrals` | `src/app/admin/referrals/page.tsx` |
| `/admin/tiers` | `src/app/admin/tiers/page.tsx` |
| `/admin/questionnaire` | `src/app/admin/questionnaire/page.tsx` |
| `/admin/audit-log` | `src/app/admin/audit-log/page.tsx` |

## API routes

Three route handlers under `src/app/api`.

### `/api/auth/[...nextauth]`

File: `src/app/api/auth/[...nextauth]/route.ts`. The NextAuth handler (credentials-based). It owns sign-in, sign-out, and session callbacks. You do not call it directly; the login forms and `getServerAuthSession()` go through it.

### `GET /api/uploads`

File: `src/app/api/uploads/route.ts`. Streams one stored file. `GET` is the only method.

| Item | Value |
| --- | --- |
| Query param | `path` (relative path inside the upload dir) |
| Delegates to | `readUploadedFile(filePath)` from `@/lib/storage` |
| 400 | body `Missing path` when `path` is absent |
| 404 | body `Not found` when `readUploadedFile` throws |
| 200 | file bytes with header `Content-Type: application/octet-stream` |

The file root is `UPLOAD_DIR` (default `./uploads`). See [Env vars](#env-vars).

```bash
curl -s "http://localhost:3000/api/uploads?path=docs/agreement.pdf" --output agreement.pdf
```

### `POST /api/aries/signup`

File: `src/app/api/aries/signup/route.ts`. Inbound webhook that records an affiliate signup against a partner referral code. `POST` only.

Auth: the request must send header `x-aries-secret` equal to `env.ariesWebhookSecret` (`ARIES_WEBHOOK_SECRET`).

Request body (validated inline by a Zod schema in the route):

| Field | Type | Constraints |
| --- | --- | --- |
| `refCode` | string | min 1, required |
| `name` | string | 1–200, required |
| `email` | string | email format, max 200, required |
| `company` | string | max 200, optional, nullable |
| `domain` | string | max 200, optional, nullable |
| `packageSlug` | string | max 200, optional, nullable |
| `notes` | string | max 2000, optional, nullable |

Responses:

| Status | Body | Cause |
| --- | --- | --- |
| 503 | `{ "error": "Webhook not configured." }` | `ARIES_WEBHOOK_SECRET` unset |
| 401 | `{ "error": "Unauthorized." }` | header missing or mismatched |
| 400 | `{ "error": "Invalid JSON body." }` | body is not JSON |
| 400 | `{ "error": "Invalid payload.", "issues": ... }` | fails the Zod schema (`issues` is `error.flatten()`) |
| 400 | `{ "error": "<message>" }` | `recordAriesAffiliateSignup` throws |
| 201 | success object (below) | new signup recorded |
| 200 | success object (below) | signup already recorded (`alreadyRecorded` true) |

Success body fields: `ok` (always `true`), `referralId`, `partnerAccountId`, `status`, `isAttributed`, `alreadyRecorded`.

```bash
curl -s -X POST http://localhost:3000/api/aries/signup \
  -H "Content-Type: application/json" \
  -H "x-aries-secret: $ARIES_WEBHOOK_SECRET" \
  -d '{
    "refCode": "PARTNER-ABC123",
    "name": "Jane Doe",
    "email": "jane@acme.com",
    "company": "Acme Inc",
    "domain": "acme.com",
    "packageSlug": "growth",
    "notes": "Came from the spring webinar"
  }'
```

## Server actions

All actions live in `src/lib/actions.ts` (top-of-file `"use server"`). They are the write API. Patterns to know before reading the table:

- **Schema actions** (8 of them) parse `FormData` against a Zod schema and `throw new Error(...)` on invalid input. The schemas are in `src/lib/validators/platform.ts`.
- **Manual actions** read `FormData` fields by hand. Most are `ADMIN`-guarded.
- **`useFormState` actions** take `(prevState, formData)` and return a state object instead of throwing. There are four: `createAffiliateAction`, `createCommissionAction`, `createPartnerDealAction`, `updatePartnerDealAction`. Their state types are `CreateAffiliateState`, `CreateCommissionState`, `PartnerDealFormState`.
- **Read-only**: `checkApplicationEmailAction(email: string)` takes a plain string, is not auth-guarded, and returns `string | undefined`.

On success, actions call `revalidatePath(...)` and/or `redirect(...)`. Note: some `revalidatePath` targets (for example `/admin/applications`, `/admin/products`, `/admin/vendors`) are not page routes under `src/app/admin`.

### Onboarding and applications

| Action | Guard | Schema | Notes |
| --- | --- | --- | --- |
| `completeInviteAction(_, formData)` | none | none | manual password match; `redirect("/login")` on success |
| `submitApplicationAction(_, formData)` | none | `applicationSchema` | `redirect("/login?applied=1")` on success |
| `checkApplicationEmailAction(email)` | none | none | read-only lookup; returns `string \| undefined` |
| `approvePartnerAction(formData)` | ADMIN | none | manual fields |
| `reviewApplicationAction(formData)` | ADMIN | `reviewApplicationSchema` | `decision`: `approve` \| `reject` |
| `activatePartnerAction(formData)` | ADMIN | none | manual fields |
| `acknowledgePartnerActivationAction()` | PARTNER | none | no args |
| `addInternalNoteAction(formData)` | ADMIN | none | manual fields |
| `deletePartnerAccountAction(formData)` | ADMIN | none | manual fields |
| `markAdminNotificationReadAction(formData)` | ADMIN | none | manual fields |

### Documents

| Action | Guard | Schema | Notes |
| --- | --- | --- | --- |
| `sendDocumentsAction(formData)` | ADMIN | none | manual fields |
| `verifyDocumentAction(formData)` | ADMIN | none | manual fields |
| `uploadDocumentAction(formData)` | PARTNER | none | file upload |
| `markPartnerDocumentSignedAction(formData)` | ADMIN | none | manual fields |

### Referrals and affiliates

| Action | Guard | Schema | Notes |
| --- | --- | --- | --- |
| `generateVendorReferralCodeAction(formData)` | PARTNER (`requireRole("PARTNER")` + `requirePartnerAccountId()`) | none | |
| `createAffiliateAction(prevState, formData)` | PARTNER | none | `useFormState`; returns `CreateAffiliateState` |
| `createReferralAction(formData)` | PARTNER | `referralSchema` | |
| `reviewReferralAction(formData)` | ADMIN | `referralReviewSchema` | `decision`: `approve` \| `reject` |

### Deals

| Action | Guard | Schema | Notes |
| --- | --- | --- | --- |
| `saveDealAction(formData)` | ADMIN | `dealSchema` | `stage` enum: `NEW`, `QUALIFYING`, `PROPOSAL`, `NEGOTIATION`, `CLOSED_WON`, `CLOSED_LOST` |
| `createPartnerDealAction(prevState, formData)` | PARTNER | none | `useFormState`; `PartnerDealFormState`; validated via `parsePartnerDealInput` |
| `updatePartnerDealAction(prevState, formData)` | PARTNER | none | `useFormState`; `PartnerDealFormState`; `parsePartnerDealInput` |
| `reviewPartnerDealAction(formData)` | ADMIN | none | manual fields |
| `deletePartnerDealAction(formData)` | ADMIN | none | manual fields |
| `updatePartnerDealStageAction(formData)` | ADMIN | none | inline stage values `PROCESSING`, `WON`, `LOST` |
| `verifyTrailingCommissionAction(formData)` | ADMIN | none | manual fields |
| `stopPartnerDealTrailingAction(formData)` | ADMIN | none | manual fields |

The partner-deal stage values (`PROCESSING`, `WON`, `LOST`) are validated inline and differ from `dealSchema.stage` above.

### Commissions and payouts

| Action | Guard | Schema | Notes |
| --- | --- | --- | --- |
| `updateCommissionStatusAction(formData)` | ADMIN | none | manual fields |
| `createClawbackAction(formData)` | ADMIN | none | manual fields |
| `createCommissionAction(prevState, formData)` | ADMIN | none | `useFormState`; returns `CreateCommissionState` |
| `createPayoutBatchAction(formData)` | ADMIN | `payoutBatchSchema` | requires `entryIds` (min 1) |
| `markPayoutBatchPaidAction(formData)` | ADMIN | none | manual fields |
| `startStripeOnboardingAction()` | PARTNER | none | gated on `env.stripeSecretKey`; no args |
| `confirmStripeOnboardingAction()` | PARTNER | none | gated on `env.stripeSecretKey`; no args |

### Tiers

| Action | Guard | Schema | Notes |
| --- | --- | --- | --- |
| `createTierAction(formData)` | ADMIN | `tierSchema` | commission type enum: `PERCENTAGE`, `FIXED` |
| `updateTierAction(formData)` | ADMIN | `tierSchema` | same enum |
| `deleteTierAction(formData)` | ADMIN | none | soft-deactivates if the tier is in use, else deletes |
| `updatePartnerTierAction(formData)` | ADMIN | none | manual fields |

### Catalog and questionnaire

| Action | Guard | Schema | Notes |
| --- | --- | --- | --- |
| `createProductAction(formData)` | ADMIN | none | direct Prisma write |
| `createPackageAction(formData)` | ADMIN | none | direct Prisma write |
| `createQuestionPromptAction(formData)` | ADMIN | none | direct Prisma write |
| `deleteQuestionPromptAction(formData)` | ADMIN | none | direct Prisma write |

### Activity

| Action | Guard | Schema | Notes |
| --- | --- | --- | --- |
| `refreshQuarterlyActivityAction()` | PARTNER | none | no args |

## Schemas

From `src/lib/validators/platform.ts`. These are the only Zod schemas the actions use.

| Schema | Used by | Key fields and enums |
| --- | --- | --- |
| `applicationSchema` | `submitApplicationAction` | `fullName` (min 2), `email`, `password` (min 8), `answers[]`; many optional string fields default to `""` |
| `referralSchema` | `createReferralAction` | `productId`, `referredCompany`, `referredContactName`, `sourceNotes` (min 10), `useCaseSummary` (min 10), `estimatedDealValue` coerced number |
| `reviewApplicationSchema` | `reviewApplicationAction` | `applicationId`, `decision`: `approve` \| `reject` |
| `referralReviewSchema` | `reviewReferralAction` | `referralId`, `decision`: `approve` \| `reject` |
| `dealSchema` | `saveDealAction` | `referralId`, `ownerName`, `stage`: `NEW` \| `QUALIFYING` \| `PROPOSAL` \| `NEGOTIATION` \| `CLOSED_WON` \| `CLOSED_LOST` |
| `tierSchema` | `createTierAction`, `updateTierAction` | `name`, `upfrontCommissionType` / `trailingCommissionType`: `PERCENTAGE` \| `FIXED`; numeric thresholds |
| `payoutBatchSchema` | `createPayoutBatchAction` | `partnerAccountId`, `entryIds[]` (min 1), `label` (min 2) |

## Env vars

From `src/lib/env.ts`. These three affect the surface in this doc.

| Variable | Maps to | Default | Effect |
| --- | --- | --- | --- |
| `UPLOAD_DIR` | `env.uploadDir` | `"./uploads"` | file root for `GET /api/uploads` |
| `STRIPE_SECRET_KEY` | `env.stripeSecretKey` | unset | gates `startStripeOnboardingAction` and `confirmStripeOnboardingAction` |
| `ARIES_WEBHOOK_SECRET` | `env.ariesWebhookSecret` | unset | required by `POST /api/aries/signup`; unset returns 503 |

## Example: calling a server action from a form

`reviewReferralAction` is `ADMIN`-guarded and parses `referralReviewSchema`. Wire it to a form with the field names the schema expects.

```tsx
import { reviewReferralAction } from "@/lib/actions";

export function ApproveReferralForm({ referralId }: { referralId: string }) {
  return (
    <form action={reviewReferralAction}>
      <input type="hidden" name="referralId" value={referralId} />
      <input type="hidden" name="decision" value="approve" />
      <textarea name="reason" placeholder="Optional reason" />
      <button type="submit">Approve referral</button>
    </form>
  );
}
```

Invalid input throws, so wrap submissions that can fail with an error boundary or a `useFormState` action instead.

## Related

- [Data model reference](./data-model.md)
- [How to onboard a partner](../how-to/onboard-a-partner.md)
- [How to configure the Aries signup webhook](../how-to/configure-the-aries-signup-webhook.md)

# How to onboard a partner

Take a partner from a submitted application to an active account that can refer deals and generate an Aries referral link.

This is an admin task. By the end, the partner account has `status = ACTIVE`, its agreement is active, and the partner can generate their own Aries referral link.

## Prerequisites

- You are signed in as a user with the `ADMIN` role. Every admin action in this guide calls `requireRole("ADMIN")` in `src/lib/actions.ts`, so non-admins are rejected.
- The applicant has already submitted an application through the public apply page (route `/apply`, file `src/app/(public)/apply/page.tsx`). Submission runs `submitApplicationAction` in `src/lib/actions.ts`, which validates with `applicationSchema` and calls `submitPartnerApplication` in `src/lib/services/platform.ts`.
- At least one active `Tier` exists. Activation validates the tier with `where: { id, isActive: true }` and throws if no active tier matches.
- You know which product the partner is being approved for. A `productId` is required to approve (see Step 2).

Background on what already exists before you start:

- A submitted application has `PartnerApplicationStatus.SUBMITTED`.
- `submitPartnerApplication` already created the `User` (role `PARTNER`, bcrypt-hashed password) and a `PartnerAccount` with `PartnerAccountStatus.INACTIVE`, a default active `Tier`, and an `affiliateId` of the form `AFF-<hex>`.
- The partner has NOT yet got a vendor referral code. That comes last, and the partner generates it themselves.

## Steps

### 1. Open the applications queue

Go to `/admin/applications`. This is the page that `reviewApplicationAction` revalidates after each review (`revalidatePath("/admin/applications")` in `src/lib/actions.ts`).

Expected result: you see submitted applications waiting for a decision.

### 2. Review and approve the application

Submit the review form, which calls `reviewApplicationAction(formData)` in `src/lib/actions.ts`. It validates against `reviewApplicationSchema` in `src/lib/validators/platform.ts` and then calls `reviewPartnerApplication` in `src/lib/services/platform.ts`.

Required form fields:

- `applicationId` (string, min length 1)
- `decision` (enum: `approve` or `reject`)
- `assignedTierId` (the schema marks this optional, but approval requires it; see below)
- `productId` (the schema marks this optional, but approval requires it; see below)
- `adminNotes` (optional)

To approve, set `decision=approve` and provide BOTH `assignedTierId` and `productId`. Even though the Zod schema marks those two as optional, `reviewPartnerApplication` throws when either is missing on approval:

```
Tier and product are required when approving an application.
```

To reject instead, set `decision=reject`. The application moves to `PartnerApplicationStatus.REJECTED` and the applicant gets a decline email. Stop here if rejecting.

Expected result on approve:

- The `PartnerAccount` is upserted to `PartnerAccountStatus.INVITED` (or stays `ACTIVE` if it already was).
- A DRAFT `Agreement` named `"Partner Agreement"` is created or reused.
- The application status becomes `PartnerApplicationStatus.APPROVED_PENDING_DOCUMENTS`.
- If the account has no `user` yet, a `PartnerInvite` is created with a token and `expiresAt` set to 14 days from now.
- `ensureAgreementDocuments` creates the NDA and PARTNER_AGREEMENT document records with status `AgreementDocumentStatus.REQUESTED`.
- The partner is emailed an invite or login link.

Note: this approval step is what creates the agreement and the document records. Final activation later flips them to active; it does not create them.

### 3. Send the documents to the partner

Submit the send-documents form, which calls `sendDocumentsAction(formData)` (field: `partnerAccountId`). It calls `sendAgreementDocuments({ partnerAccountId, adminUserId })` in `src/lib/services/platform.ts`.

Expected result:

- The partner account moves to `PartnerAccountStatus.PENDING_DOCUMENTS`.
- The application moves to `PartnerApplicationStatus.DOCUMENTS_SENT`.
- The NDA and agreement document records are ensured and the partner is emailed.

### 4. Wait for the partner to upload signed documents

The partner uploads each document from their portal via `uploadDocumentAction` -> `uploadPartnerDocument`. Each document carries an `AgreementDocumentType` of `NDA` or `PARTNER_AGREEMENT`.

Expected result: once all documents are `UPLOADED` or `VERIFIED`, the account moves to `PartnerAccountStatus.PENDING_ACTIVATION` and the application moves to `PartnerApplicationStatus.SIGNED_DOCUMENTS_UPLOADED`.

### 5. Open the partner detail page

Go to `/admin/partners` (file `src/app/admin/partners/page.tsx`), find the partner, and click `Review` to open `/admin/partners/[id]` (file `src/app/admin/partners/[id]/page.tsx`).

The list is paginated at 10 rows per page (`PAGE_SIZE = 10`). Non-active partners show a `Review` link.

Expected result: the detail page shows an "NDA & agreement approval" card and an "Activate partner" form.

### 6. Mark the NDA and agreement as signed

In the "NDA & agreement approval" card, submit each `markPartnerDocumentSignedAction` form. Required fields:

- `partnerAccountId`
- `documentType` (`NDA` or `AGREEMENT`)
- `signed` (`true` or `false`)

Mark both `NDA` and `AGREEMENT` as `signed=true`. This sets `ndaSignedAt` and `agreementSignedAt` on the partner account, which the activation step on this page checks.

Expected result: the page computes `canActivate = ndaSigned && agreementSigned && partner.status !== "ACTIVE"`, so the "Activate partner" button becomes enabled.

### 7. Activate the partner

In the "Activate partner" form, pick a tier from the `<select name="tierId">` (it defaults to the partner's current `tierId` and is required) and submit. This form calls `approvePartnerAction(formData)` in `src/lib/actions.ts`.

Required fields:

- `partnerAccountId`
- `tierId` (throws `"Select a tier before activating this partner."` if blank)

`approvePartnerAction` calls `approvePartnerAccount` in `src/lib/services/platform.ts`, which:

- Validates the tier is active, else throws `"Select a valid tier before activating this partner."`.
- Requires `ndaSignedAt` to be set, else throws `"Mark the NDA as signed before activating this partner."`.
- Requires `agreementSignedAt` to be set, else throws `"Mark the partner agreement as signed before activating this partner."`.
- Sets the account to `PartnerAccountStatus.ACTIVE` and stamps `activatedAt`.
- Sets the application to `PartnerApplicationStatus.ACTIVE`.
- Ensures an active `Agreement` row via `ensurePartnerAgreementRecord`.
- Creates an "Account activated" partner notification.

Expected result: the partner account is `ACTIVE` and can now submit deals and referrals.

#### Alternative: the verification-gated activation path

There is a second activation action, `activatePartnerAction(formData)` in `src/lib/actions.ts`, used by the applications flow rather than the partner detail page. It requires `partnerAccountId` and `tierId`, then calls `activatePartnerAccount`, which gates differently:

- The partner must have a `user` (a set password), else throws `"Partner must set a password before activation."`.
- The account must have `>= 2` documents that are ALL `AgreementDocumentStatus.VERIFIED`, else throws `"Both signed documents must be verified before activation."`.

It then delegates to `approvePartnerAccount` and emails the partner that their account is active. Use this path when you gate on verified document records (set via `verifyDocumentAction` -> `verifyPartnerDocument`, which sets a document's status to `VERIFIED`) rather than manually marking documents signed. The partner detail "Activate partner" button uses `approvePartnerAction`, not this one.

### 8. Have the partner generate their Aries referral link

Activation does NOT auto-generate the partner's vendor referral code. The partner generates it themselves from their portal once active.

The partner-side `generateVendorReferralCodeAction(formData)` in `src/lib/actions.ts` calls `requireRole("PARTNER")` (not admin), checks the caller owns the `partnerAccountId`, and requires the account `status` to be `ACTIVE`, else throws `"Your account is not active yet. Contact the admin."`. It calls `generateVendorReferralCode` in `src/lib/services/platform.ts`, which generates a `vendorReferralCode` of the form `<PREFIX>-<hex>` (prefix is the slugified name, max 10 chars), sets `vendorReferralCodeActive = true`, and returns `{ code, link }`.

The link is built by `buildAriesReferralLink(code)` in `src/lib/referral-links.ts` from the base `https://aries.sugarandleather.com/signup`:

```
https://aries.sugarandleather.com/signup?ref=<code>
```

Expected result: the partner sees their Aries referral link in their portal. As admin, you can view it on `/admin/partners`, where the page computes `referralLink` with `buildAriesReferralLink(partner.vendorReferralCode)` but only when `vendorReferralCode && vendorReferralCodeActive`.

## Verification

Confirm the onboarding worked:

1. On `/admin/partners`, the partner's status reads `ACTIVE`.
2. On `/admin/partners/[id]`, the "Activate partner" form is no longer shown. Both the activation form and the "NDA & agreement approval" card only render while `partner.status !== "ACTIVE"`.
3. The application status is `PartnerApplicationStatus.ACTIVE`.
4. After the partner generates their code, the `referralLink` column on `/admin/partners` shows a `https://aries.sugarandleather.com/signup?ref=<code>` URL.

## Troubleshooting

- "Tier and product are required when approving an application." You set `decision=approve` but left `assignedTierId` or `productId` empty. Provide both.
- "Select a tier before activating this partner." The `tierId` field was blank on the "Activate partner" form (`approvePartnerAction`) or on `activatePartnerAction`. Pick a tier.
- "Select a valid tier before activating this partner." The `tierId` you submitted does not match an active tier (`isActive: true`). Use a tier that is active.
- "Mark the NDA as signed before activating this partner." / "Mark the partner agreement as signed before activating this partner." `ndaSignedAt` or `agreementSignedAt` is not set. Go back to the "NDA & agreement approval" card and submit `markPartnerDocumentSignedAction` with `signed=true` for both `NDA` and `AGREEMENT`.
- "Partner must set a password before activation." (only on the `activatePartnerAction` path) The partner has no `user`. They must accept the invite and set a password first.
- "Both signed documents must be verified before activation." (only on the `activatePartnerAction` path) Fewer than 2 documents exist, or not all are `VERIFIED`. Verify each with `verifyDocumentAction` (fields: `partnerAccountId`, `type`).
- "Your account is not active yet. Contact the admin." The partner tried to generate a referral code before activation. Finish Step 7 first.
- "You can only manage your own referral code." A partner tried to generate a code for an account that is not theirs. The `partnerAccountId` must match the caller.
- Partner reports passwords were rejected at apply time: `submitApplicationAction` returns "Passwords do not match." when `password` and `confirmPassword` differ. Have them resubmit with matching values.

## Related

- [Routes and server actions reference](../reference/routes-and-server-actions.md)
- [How commissions and referral attribution work](../explanation/commission-and-attribution.md)
- [How to record a partner payout](./record-a-payout.md)

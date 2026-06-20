# How to configure the Aries signup webhook

Connect Aries to the Sugar & Leather partner portal so partner-referred signups land in the portal as referrals.

## Prerequisites

- Access to the portal's environment configuration (where `ARIES_WEBHOOK_SECRET` is set).
- Access to the aries-app environment configuration (where `VMS_WEBHOOK_SECRET` is set).
- A running portal instance that exposes `POST /api/aries/signup`.
- The portal database has a `Product` with slug `aries-ai`. The handler requires it (see Troubleshooting).
- At least one active partner with an active referral code, so you can send a test request.
- `openssl` and `curl` on your machine.

## Steps

### 1. Generate a shared secret

Run:

```bash
openssl rand -hex 32
```

Expected result: a 64-character hex string. This is the shared secret both sides will use.

### 2. Set the secret on the portal

Set `ARIES_WEBHOOK_SECRET` in the portal environment to the value from step 1. The portal reads it as `process.env.ARIES_WEBHOOK_SECRET` (`src/lib/env.ts`).

```bash
ARIES_WEBHOOK_SECRET="<the-hex-string-from-step-1>"
```

`ARIES_WEBHOOK_SECRET` is optional in the portal's env loader (only `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` are required). If you leave it empty, the webhook is disabled and returns `503` (see Troubleshooting).

Expected result: the endpoint stops returning `503`. (The env loader does not warn when `ARIES_WEBHOOK_SECRET` is unset; it only warns for the three required vars.)

### 3. Set the matching secret on aries-app

Set `VMS_WEBHOOK_SECRET` in aries-app to the exact same value. The two must match byte-for-byte. The portal compares the incoming header against its own secret with a plain `!==` (strict equality, not a constant-time compare).

```bash
VMS_WEBHOOK_SECRET="<the-same-hex-string>"
```

Expected result: aries-app sends the secret in the `x-aries-secret` header on every signup POST, and it matches the portal value.

### 4. Point aries-app at the endpoint

Configure aries-app to POST partner signups to the portal route:

```
POST <portal-base-url>/api/aries/signup
```

The route is defined by the App Router file `src/app/api/aries/signup/route.ts`, which exports an async `POST(request: NextRequest)` handler.

Required request headers:

| Header | Value |
| --- | --- |
| `Content-Type` | `application/json` |
| `x-aries-secret` | the shared secret from step 1 |

JSON body (validated by a Zod schema):

| Field | Rule |
| --- | --- |
| `refCode` | string, min length 1, required |
| `name` | string, 1 to 200 chars, required |
| `email` | valid email, max 200 chars, required |
| `company` | string, max 200 chars, optional, nullable |
| `domain` | string, max 200 chars, optional, nullable |
| `packageSlug` | string, max 200 chars, optional, nullable |
| `notes` | string, max 2000 chars, optional, nullable |

The `refCode` is the `ref` query parameter from the partner referral link. `buildAriesReferralLink(code)` (`src/lib/referral-links.ts`) produces links of the form:

```
https://aries.sugarandleather.com/signup?ref=<code>
```

Expected result: aries-app sends a well-formed authenticated POST for each signup.

### 5. Send a test signup with curl

Replace the base URL, secret, and `refCode` with real values:

```bash
curl -i -X POST "https://portal.example.com/api/aries/signup" \
  -H "Content-Type: application/json" \
  -H "x-aries-secret: <the-hex-string-from-step-1>" \
  -d '{
    "refCode": "PARTNER123",
    "name": "Jordan Rivera",
    "email": "jordan@acme.com",
    "company": "Acme Inc",
    "domain": "acme.com",
    "packageSlug": "aries-pro",
    "notes": "Signed up from the partner landing page."
  }'
```

Expected result on a brand-new signup: HTTP `201` and a JSON body like:

```json
{
  "ok": true,
  "referralId": "clx...",
  "partnerAccountId": "clx...",
  "status": "SUBMITTED",
  "isAttributed": true,
  "alreadyRecorded": false
}
```

## Verification

Confirm the integration end to end:

1. The curl call returns `201` with `ok: true` and a `referralId`. This means `recordAriesAffiliateSignup` (`src/lib/services/platform.ts`) created a referral row.
2. The referred contact appears in the portal under the partner's referrals (`/partner/referrals`), and the partner receives a notification ("New Aries signup via your referral link").
3. An audit log entry exists for the referral with action `referral.aries_signup`.

### Response codes at a glance

| Status | When | Body |
| --- | --- | --- |
| `201` | New referral created (`alreadyRecorded: false`) | `{ ok, referralId, partnerAccountId, status, isAttributed, alreadyRecorded }` |
| `200` | A referral already existed for this email (`alreadyRecorded: true`) | same shape, echoing the existing referral |
| `400` | Invalid JSON, invalid payload, or a business-rule error | `{ error }` (payload errors also include `issues`) |
| `401` | `x-aries-secret` did not match | `{ error: "Unauthorized." }` |
| `503` | `ARIES_WEBHOOK_SECRET` is unset on the portal | `{ error: "Webhook not configured." }` |

### First-attribution and dedup behavior

The handler runs two distinct checks inside one transaction. They behave differently, so read both.

1. Exact email match. The handler first looks for any existing referral whose `referredContactEmail` equals the normalized (trimmed, lowercased) email, oldest first. If one exists, it returns that existing referral with `alreadyRecorded: true` and HTTP `200`. No new row is created, and `status` / `isAttributed` are whatever the original row already had.

2. Lead-key attribution. Only when no email match exists does the handler compute `normalizedLeadKey` via `normalizeLeadKey` (`src/lib/utils.ts`) and look for an existing referral with the same `normalizedLeadKey` and `isAttributed: true`. The result feeds `deriveReferralSubmissionStatus` (`src/lib/rules.ts`):
   - First signup for that lead key: `status: "SUBMITTED"`, `isAttributed: true`.
   - Later signup with the same lead key but a different email: `status: "DUPLICATE_NOT_ATTRIBUTED"`, `isAttributed: false`.
   In both cases a new referral row is created and `alreadyRecorded` is `false`, so the response is HTTP `201`. First attribution wins: the earliest attributed referral keeps the attribution.

The lead key is derived in this priority order: an explicit `domain` becomes `domain:<cleaned>`; otherwise the email's domain becomes `domain:<emailDomain>`; otherwise `email:<email>`; otherwise `company:<stripped>`. Domain cleaning strips `https://` or `http://` and a leading `www.`, then lowercases.

To verify first-attribution, send a second signup with the same `domain` (or same email domain) but a different `email`. Expect HTTP `201`, `status: "DUPLICATE_NOT_ATTRIBUTED"`, and `isAttributed: false`. To verify email dedup, resend the same `email`. Expect HTTP `200` and `alreadyRecorded: true`.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `503 {"error":"Webhook not configured."}` | `ARIES_WEBHOOK_SECRET` is empty or unset on the portal | Set `ARIES_WEBHOOK_SECRET` (step 2) and restart the portal |
| `401 {"error":"Unauthorized."}` | `x-aries-secret` header is missing or does not match the portal secret byte-for-byte | Confirm `VMS_WEBHOOK_SECRET` (aries-app) equals `ARIES_WEBHOOK_SECRET` (portal). Watch for trailing whitespace or quoting differences; the compare is strict `!==` |
| `400 {"error":"Invalid JSON body."}` | The request body was not valid JSON | Send valid JSON and set `Content-Type: application/json` |
| `400 {"error":"Invalid payload.","issues":...}` | Body failed Zod validation (missing `refCode`/`name`/`email`, bad email, or a field over its max length) | Read `issues` (a flattened Zod error) and fix the offending fields per the body table in step 4 |
| `400 {"error":"Missing referral code."}` | `refCode` was whitespace only | Send a non-empty `refCode` (the partner's `ref` code) |
| `400 {"error":"Referral code not recognized."}` | No partner has that `vendorReferralCode`, or the code is deactivated (`vendorReferralCodeActive` is false) | Use an active partner code |
| `400 {"error":"Partner is not active."}` | The partner exists but is not `ACTIVE` | Activate the partner, or use an active partner |
| `400 {"error":"Self-referrals are not allowed."}` | The signup email matches the partner's `primaryContactEmail` (case-insensitive) | Use a different signup email |
| `400 {"error":"Aries product not configured."}` | No `Product` with slug `aries-ai` exists | Create the `aries-ai` product in the portal database |
| `400 {"error":"Unexpected error."}` | An unhandled error was thrown while recording the signup | Check portal server logs |

All business-rule errors above are thrown inside the handler's try block and surface as HTTP `400` with the thrown message in `error`.

## Related

- [Routes and server actions reference](../reference/routes-and-server-actions.md)
- [How commissions and referral attribution work](../explanation/commission-and-attribution.md)

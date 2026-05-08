import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/lib/env";
import { recordAriesAffiliateSignup } from "@/lib/services/platform";

const payloadSchema = z.object({
  refCode: z.string().min(1),
  name: z.string().min(1).max(200),
  email: z.string().email().max(200),
  company: z.string().max(200).optional().nullable(),
  domain: z.string().max(200).optional().nullable(),
  packageSlug: z.string().max(200).optional().nullable(),
  notes: z.string().max(2000).optional().nullable()
});

export async function POST(request: NextRequest) {
  if (!env.ariesWebhookSecret) {
    return NextResponse.json({ error: "Webhook not configured." }, { status: 503 });
  }

  const provided = request.headers.get("x-aries-secret");
  if (provided !== env.ariesWebhookSecret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = payloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload.", issues: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const result = await recordAriesAffiliateSignup(parsed.data);
    return NextResponse.json(
      {
        ok: true,
        referralId: result.referral.id,
        partnerAccountId: result.partnerAccountId,
        status: result.referral.status,
        isAttributed: result.referral.isAttributed,
        alreadyRecorded: result.alreadyRecorded
      },
      { status: result.alreadyRecorded ? 200 : 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

import Stripe from "stripe";
import { env } from "@/lib/env";

const stripe = env.stripeSecretKey ? new Stripe(env.stripeSecretKey) : null;

export async function provisionConnectAccount(email: string, businessName: string) {
  if (!stripe) {
    return { accountId: `stub_${businessName.toLowerCase().replace(/[^a-z0-9]+/g, "_")}` };
  }

  const account = await stripe.accounts.create({
    type: "express",
    email,
    business_profile: {
      name: businessName
    }
  });

  return { accountId: account.id };
}

export async function createConnectOnboardingLink(accountId: string) {
  if (!stripe) {
    return {
      url: `${env.appBaseUrl}/partner/dashboard?stripe=stub`
    };
  }

  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: env.stripeConnectRefreshUrl,
    return_url: env.stripeConnectReturnUrl
  });

  return { url: link.url };
}

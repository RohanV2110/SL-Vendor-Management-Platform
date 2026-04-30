const ARIES_SIGNUP_URL = "https://aries.sugarandleather.com/signup";

export function buildAriesReferralLink(code: string) {
  const url = new URL(ARIES_SIGNUP_URL);
  url.searchParams.set("ref", code);
  return url.toString();
}

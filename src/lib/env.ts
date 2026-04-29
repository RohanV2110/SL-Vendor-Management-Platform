const required = ["DATABASE_URL", "NEXTAUTH_SECRET", "NEXTAUTH_URL"] as const;

for (const key of required) {
  if (!process.env[key]) {
    console.warn(`Missing environment variable: ${key}`);
  }
}

export const env = {
  appBaseUrl: process.env.APP_BASE_URL ?? "http://localhost:3000",
  uploadDir: process.env.UPLOAD_DIR ?? "./uploads",
  resendApiKey: process.env.RESEND_API_KEY,
  resendFromEmail: process.env.RESEND_FROM_EMAIL ?? "partners@sugarleather.ai",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY,
  stripeConnectRefreshUrl:
    process.env.STRIPE_CONNECT_REFRESH_URL ?? "http://localhost:3000/partner/dashboard",
  stripeConnectReturnUrl:
    process.env.STRIPE_CONNECT_RETURN_URL ?? "http://localhost:3000/partner/dashboard"
};

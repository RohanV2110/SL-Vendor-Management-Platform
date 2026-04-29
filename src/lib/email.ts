type EmailPayload = {
  to: string;
  subject: string;
  html: string;
};

export async function sendTransactionalEmail(payload: EmailPayload) {
  console.log("Email stub", payload.to, payload.subject);
  return { ok: true };
}

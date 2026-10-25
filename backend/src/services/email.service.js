import { resendClient } from "#src/config/resend.js";
import { createWelcomeEmail } from "#src/utils/emailTemplates.js";
import logger from "#config/logger.js";
import { ENV } from "#config/env.js";

// Resend's shared test address works until a domain is verified (it only
// delivers to the Resend account owner's own email).
export const sender = {
  email: ENV.EMAIL_FROM || "onboarding@resend.dev",
  name: ENV.EMAIL_FROM_NAME || "Convo",
};

// Sends one email. Throws when Resend refuses it, e.g. "The convo.com domain
// is not verified" when EMAIL_FROM isn't on a verified domain, or when email
// isn't configured at all, so callers can undo what the email was for.
export const sendEmail = async ({ to, subject, html, text }) => {
  // Locally without Resend the email goes to the server log instead, links
  // included, and counts as sent so those links keep working.
  if (!ENV.RESEND_API_KEY && ENV.NODE_ENV === "development") {
    logger.info("Email (development only, Resend is not configured)", { to, subject, text });
    return { logged: true };
  }
  const { data, error } = await resendClient.emails.send({
    from: `${sender.name} <${sender.email}>`,
    to,
    subject,
    html,
    text,
  });
  if (error) throw new Error(`Failed to send "${subject}": ${error.message ?? error}`);
  // The no-op client (no RESEND_API_KEY) sends nothing.
  if (data?.disabled) throw new Error("Email is not configured (RESEND_API_KEY is not set)");
  return data;
};

export const sendWelcomeEmail = async (to, name, clientURL) => {
  const { subject, html, text } = createWelcomeEmail({
    name,
    email: to,
    appUrl: clientURL ?? "http://localhost:5173",
  });
  const { data, error } = await resendClient.emails.send({
    from: `${sender.name} <${sender.email}>`,
    to: to,
    subject,
    html,
    text,
  });

  if (error) {
    logger.error("Error sending welcome email:", error);
    throw new Error("Failed to send welcome email");
  }

  logger.info("Welcome email sent:", data);
};

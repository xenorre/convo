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

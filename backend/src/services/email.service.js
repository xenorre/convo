import { resendClient } from "#src/config/resend.js";
import { createWelcomeEmailTemplate } from "#src/utils/emailTemplates.js";
import logger from "#config/logger.js";
import { ENV } from "#config/env.js";

export const sender = {
  email: ENV.EMAIL_FROM,
  name: ENV.EMAIL_FROM_NAME,
};

export const sendWelcomeEmail = async (to, name, clientURL) => {
  const { data, error } = await resendClient.emails.send({
    from: `${sender.name} <${sender.email}>`,
    to: to,
    subject: "Welcome to Convo!",
    html: createWelcomeEmailTemplate(name, clientURL),
  });

  if (error) {
    logger.error("Error sending welcome email:", error);
    throw new Error("Failed to send welcome email");
  }

  logger.info("Welcome email sent:", data);
};

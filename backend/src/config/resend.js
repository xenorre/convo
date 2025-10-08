import { Resend } from "resend";
import { ENV } from "#config/env.js";
import logger from "#config/logger.js";

let resendClient;
if (ENV.RESEND_API_KEY) {
  resendClient = new Resend(ENV.RESEND_API_KEY);
} else {
  // Provide a safe no-op client in environments where email is not configured
  resendClient = {
    emails: {
      send: async (payload) => {
        logger.warn("Email disabled: RESEND_API_KEY not set; skipping send", {
          to: payload?.to,
          subject: payload?.subject,
        });
        return { data: { disabled: true }, error: null };
      },
    },
  };
}

export { resendClient };

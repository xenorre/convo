import { z } from "zod";

export const MESSAGE_MAX_LENGTH = 2000;

// Empty text is only valid for a message with a file; the service checks that.
export const messageEditSchema = z
  .object({
    text: z.string().trim().max(MESSAGE_MAX_LENGTH, `Message must be at most ${MESSAGE_MAX_LENGTH} characters`),
  })
  .strict();

export const messageDeleteQuerySchema = z
  .object({
    for: z.enum(["me", "everyone"]).default("me"),
  })
  .strict();

export const chatMuteSchema = z
  .object({
    duration: z.enum(["1h", "8h", "24h", "forever"]),
  })
  .strict();

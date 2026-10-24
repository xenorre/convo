import { z } from "zod";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "#services/password.service.js";

// Length only; the rest of the password policy (personal words, strength,
// breaches) needs the account and the network, so the service checks it.
const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`);

export const signUpSchema = z.object({
  // Same limits as changing the name in Settings.
  fullName: z.string().trim().min(2, "Use at least 2 characters").max(50, "Use at most 50 characters"),
  email: z.email("Enter a valid email address").max(254).toLowerCase().trim(),
  password: newPassword,
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword,
  })
  .strict()
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: "New password must be different from the current one",
    path: ["newPassword"],
  });

export const signInSchema = z.object({
  email: z.email().toLowerCase().trim(),
  password: z.string().min(1),
});

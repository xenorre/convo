import { z } from "zod";

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  email: z.email().max(255).toLowerCase().trim(),
  password: z.string().min(6).max(128),
});

// Same length rules as sign-up for the new password.
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(6).max(128),
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

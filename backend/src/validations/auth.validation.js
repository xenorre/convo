import { z } from "zod";

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2).max(255),
  email: z.email().max(255).toLowerCase().trim(),
  password: z.string().min(6).max(128),
});

export const signInSchema = z.object({
  email: z.email().toLowerCase().trim(),
  password: z.string().min(1),
});

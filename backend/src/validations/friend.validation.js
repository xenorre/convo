import mongoose from "mongoose";
import { z } from "zod";

const objectId = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), "Invalid user ID");

export const friendRequestSchema = z.object({ userId: objectId }).strict();

export const SEARCH_MIN_LENGTH = 3;
export const userSearchSchema = z.object({
  q: z
    .string()
    .trim()
    .min(SEARCH_MIN_LENGTH, `Type at least ${SEARCH_MIN_LENGTH} characters`)
    .max(50),
});

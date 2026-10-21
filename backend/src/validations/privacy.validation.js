import { z } from "zod";

export const privacyUpdateSchema = z
  .object({
    privacy: z
      .object({
        allowMessagesFrom: z.enum(["everyone", "friends"]).optional(),
        allowFriendRequestsFrom: z.enum(["everyone", "nobody"]).optional(),
        showOnlineStatus: z.boolean().optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, "Nothing to update"),
  })
  .strict();

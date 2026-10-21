import express from "express";
import {
  acceptFriendRequest,
  cancelFriendRequest,
  createFriendRequest,
  declineFriendRequest,
  deleteFriend,
  getFriendRequests,
  getFriends,
} from "#controllers/friend.controller.js";
import { protectRoute } from "#src/middleware/auth.middleware.js";
import { validateObjectIdParam } from "#src/middleware/objectId.middleware.js";
import { rateLimitPerUser } from "#src/middleware/rateLimit.middleware.js";

const router = express.Router();

router.use(protectRoute);

// Keeps one account from spraying invitations.
const requestLimit = rateLimitPerUser({ windowMs: 10 * 60 * 1000, max: 30 });

router.get("/", getFriends);
router.get("/requests", getFriendRequests);
router.post("/requests", requestLimit, createFriendRequest);
router.post("/requests/:id/accept", validateObjectIdParam("id"), acceptFriendRequest);
router.post("/requests/:id/decline", validateObjectIdParam("id"), declineFriendRequest);
router.delete("/requests/:id", validateObjectIdParam("id"), cancelFriendRequest);
router.delete("/:userId", validateObjectIdParam("userId"), deleteFriend);

export default router;

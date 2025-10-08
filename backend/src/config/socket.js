import { Server } from "socket.io";
import http from "http";
import express from "express";
import { ENV } from "#config/env.js";
import socketAuthMiddleware from "#src/middleware/socket.auth.middleware.js";
import logger from "#config/logger.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  // Tag connections by user room for targeted delivery across instances
  connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      const devAllowed = [
        /^https?:\/\/localhost:\d+$/,
        /^https?:\/\/127\.0\.0\.1:\d+$/,
        /^https?:\/\/192\.168\.\d+\.\d+:\d+$/,
      ];
      if (ENV.CLIENT_URL) devAllowed.push(ENV.CLIENT_URL);
      const isDev = ENV.NODE_ENV !== "production";
      const allowed = (
        isDev ? devAllowed : [ENV.CLIENT_URL].filter(Boolean)
      ).some((pat) =>
        typeof pat === "string" ? pat === origin : pat.test(origin)
      );
      return allowed
        ? callback(null, true)
        : callback(new Error(`Not allowed by Socket.io CORS: ${origin}`));
    },
    credentials: true,
  },
});

// Optional: use Redis adapter when REDIS_URL is present
(async () => {
  if (ENV.REDIS_URL) {
    try {
      const pubClient = createClient({ url: ENV.REDIS_URL });
      const subClient = pubClient.duplicate();
      pubClient.on("error", (err) => logger.error("Redis pub client error", { error: err.message }));
      subClient.on("error", (err) => logger.error("Redis sub client error", { error: err.message }));
      await pubClient.connect();
      await subClient.connect();
      io.adapter(createAdapter(pubClient, subClient));
      logger.info("Socket.IO Redis adapter connected");
    } catch (err) {
      logger.error("Failed to initialize Redis adapter for Socket.IO", { error: err.message });
    }
  }
})();

io.use(socketAuthMiddleware);

export function getReceiverSocketId(userId) {
  return userSocketMap[userId];
}

const userSocketMap = {};

// Optional presence via Redis
let presenceClient = null;
(async () => {
  if (ENV.REDIS_URL) {
    try {
      presenceClient = createClient({ url: ENV.REDIS_URL });
      presenceClient.on("error", (err) => logger.error("Redis presence client error", { error: err.message }));
      await presenceClient.connect();
      logger.info("Presence Redis client connected");
    } catch (e) {
      logger.error("Failed to connect Presence Redis client", { error: e.message });
    }
  }
})();

const userRoom = (userId) => `user:${userId}`;
const ONLINE_USERS_SET = "online_users";
const USER_SOCKETS_PREFIX = "user_sockets:"; // user_sockets:<userId> is a set

io.on("connection", (socket) => {
  logger.info(`User connected: ${socket.user.fullName}`);

  const userId = socket.userId;
  socket.join(userRoom(userId));

  // Local cache for backward compatibility
  userSocketMap[userId] = socket.id;

  const updatePresenceOnConnect = async () => {
    try {
      if (presenceClient) {
        await presenceClient.sAdd(`${USER_SOCKETS_PREFIX}${userId}`, socket.id);
        await presenceClient.sAdd(ONLINE_USERS_SET, userId);
        const users = await presenceClient.sMembers(ONLINE_USERS_SET);
        io.emit("getOnlineUsers", users);
      } else {
        io.emit("getOnlineUsers", Object.keys(userSocketMap));
      }
    } catch (e) {
      logger.error("Presence update (connect) failed", { error: e.message });
    }
  };

  updatePresenceOnConnect();

  socket.on("disconnect", async () => {
    logger.info(`User disconnected: ${socket.user.fullName}`);
    delete userSocketMap[userId];

    try {
      if (presenceClient) {
        await presenceClient.sRem(`${USER_SOCKETS_PREFIX}${userId}`, socket.id);
        const remaining = await presenceClient.sCard(`${USER_SOCKETS_PREFIX}${userId}`);
        if (remaining === 0) {
          await presenceClient.sRem(ONLINE_USERS_SET, userId);
        }
        const users = await presenceClient.sMembers(ONLINE_USERS_SET);
        io.emit("getOnlineUsers", users);
      } else {
        io.emit("getOnlineUsers", Object.keys(userSocketMap));
      }
    } catch (e) {
      logger.error("Presence update (disconnect) failed", { error: e.message });
    }
  });
});

export { io, server, app };

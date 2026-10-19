import { Server } from "socket.io";
import http from "http";
import express from "express";
import { ENV } from "#config/env.js";
import socketAuthMiddleware from "#src/middleware/socket.auth.middleware.js";
import logger from "#config/logger.js";
import { createAdapter } from "@socket.io/redis-adapter";
import { createClient } from "redis";
import {
  createSocketRegistry,
  joinActiveSession,
} from "#services/socket-session.service.js";

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  // Do not enable connectionStateRecovery: Socket.IO restores rooms and replays
  // packets before auth middleware, even with skipMiddlewares: false. The
  // frontend reloads messages over authenticated HTTP after reconnecting.
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

io.use(socketAuthMiddleware);

export function getReceiverSocketId(userId) {
  return userSockets.receiver(userId);
}

const userSockets = createSocketRegistry();

let presenceClient = null;
let infrastructureReady;

export const initializeSocketInfrastructure = () => {
  if (!infrastructureReady) {
    infrastructureReady = (async () => {
      if (!ENV.REDIS_URL) return;
      const pubClient = createClient({ url: ENV.REDIS_URL });
      const subClient = pubClient.duplicate();
      const redisPresence = pubClient.duplicate();
      const clients = [pubClient, subClient, redisPresence];
      for (const client of clients) {
        client.on("error", (error) => logger.error("Socket Redis client error", { error: error.message }));
      }
      try {
        await Promise.all(clients.map((client) => client.connect()));
        // Install the adapter before listening. Replacing it after connections
        // exist would discard rooms used to revoke those sessions.
        io.adapter(createAdapter(pubClient, subClient));
        presenceClient = redisPresence;
        logger.info("Socket.IO Redis adapter and presence connected");
      } catch (error) {
        await Promise.allSettled(clients.map((client) =>
          client.isOpen ? client.disconnect() : Promise.resolve()
        ));
        throw error;
      }
    })();
  }
  return infrastructureReady;
};

const ONLINE_USERS_SET = "online_users";
const USER_SOCKETS_PREFIX = "user_sockets:"; // user_sockets:<userId> is a set

io.on("connection", async (socket) => {
  const userId = socket.userId;
  let registered = false;
  let presenceReady = Promise.resolve();

  socket.on("disconnect", async () => {
    logger.info(`User disconnected: ${socket.user.fullName}`);
    if (!registered) return;
    userSockets.remove(userId, socket.id);

    try {
      // A disconnect during Redis registration must remove the socket only
      // after its pending registration has completed.
      await presenceReady;
      if (presenceClient) {
        await presenceClient.eval(
          `redis.call('SREM', KEYS[1], ARGV[1])
           if redis.call('SCARD', KEYS[1]) == 0 then
             redis.call('SREM', KEYS[2], ARGV[2])
           end
           return 1`,
          {
            keys: [`${USER_SOCKETS_PREFIX}${userId}`, ONLINE_USERS_SET],
            arguments: [socket.id, userId],
          }
        );
        const users = await presenceClient.sMembers(ONLINE_USERS_SET);
        io.emit("getOnlineUsers", users);
      } else {
        io.emit("getOnlineUsers", userSockets.onlineUsers());
      }
    } catch (e) {
      logger.error("Presence update (disconnect) failed", { error: e.message });
    }
  });

  try {
    if (!(await joinActiveSession(socket)) || !socket.connected) return;
    logger.info(`User connected: ${socket.user.fullName}`);
    userSockets.add(userId, socket.id);
    registered = true;

    presenceReady = (async () => {
      try {
        if (presenceClient) {
          await presenceClient.multi()
            .sAdd(`${USER_SOCKETS_PREFIX}${userId}`, socket.id)
            .sAdd(ONLINE_USERS_SET, userId)
            .exec();
          const users = await presenceClient.sMembers(ONLINE_USERS_SET);
          io.emit("getOnlineUsers", users);
        } else {
          io.emit("getOnlineUsers", userSockets.onlineUsers());
        }
      } catch (e) {
        logger.error("Presence update (connect) failed", { error: e.message });
      }
    })();
    await presenceReady;
  } catch (error) {
    logger.error("Socket session validation failed", { error: error.message });
    socket.disconnect(true);
  }
});

export { io, server, app };

import { isSessionActive, SESSION_REVOKED } from "#services/session.service.js";

export const userRoom = (userId) => `user:${userId}`;
export const sessionRoom = (userId, sessionId) =>
  `session:${userId}:${sessionId}`;

export const revokeSessionSockets = (io, userId, sessionId, reason = SESSION_REVOKED) => {
  if (!sessionId) return;
  const room = sessionRoom(userId, sessionId);
  // Both operations use the adapter, so they also reach other server instances
  // when the optional Redis adapter is enabled.
  io.to(room).emit("session:revoked", reason);
  io.in(room).disconnectSockets(true);
};

export const joinActiveSession = async (socket, checkSession = isSessionActive) => {
  await socket.join(sessionRoom(socket.userId, socket.sessionId));

  // A login may have revoked this session after its handshake but before it
  // joined the room. Joining first and checking again closes that gap.
  const active = await checkSession(socket.userId, socket.sessionId);
  if (!active) {
    socket.emit("session:revoked", SESSION_REVOKED);
    socket.disconnect(true);
    return false;
  }
  if (!socket.connected) return false;
  await socket.join(userRoom(socket.userId));
  return socket.connected;
};

export const createSocketRegistry = () => {
  const socketsByUser = new Map();
  return {
    add(userId, socketId) {
      const sockets = socketsByUser.get(userId) || new Set();
      sockets.add(socketId);
      socketsByUser.set(userId, sockets);
    },
    remove(userId, socketId) {
      const sockets = socketsByUser.get(userId);
      sockets?.delete(socketId);
      if (sockets?.size === 0) socketsByUser.delete(userId);
    },
    receiver(userId) {
      return socketsByUser.get(userId)?.values().next().value;
    },
    onlineUsers() {
      return [...socketsByUser.keys()];
    },
  };
};

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';
import type { AppSocket } from '@/types/socket';

export interface ConnectionStatus {
  isConnected: boolean;
  isReconnecting: boolean;
  connectionError: string | null;
}

const NO_SOCKET: ConnectionStatus = {
  isConnected: false,
  isReconnecting: false,
  connectionError: null,
};

// How a socket stands before any of its events arrive.
const initialStatus = (socket: AppSocket): ConnectionStatus => ({
  isConnected: socket.connected,
  isReconnecting: false,
  connectionError: null,
});

export const useConnectionStatus = () => {
  const { socket } = useAuthStore();
  // Kept together with the socket it describes, so a new socket starts from
  // its own state instead of the previous one's.
  const [tracked, setTracked] = useState<{ socket: AppSocket | null; status: ConnectionStatus }>({
    socket: null,
    status: NO_SOCKET,
  });

  useEffect(() => {
    if (!socket) return;
    const update = (change: (status: ConnectionStatus) => ConnectionStatus) =>
      setTracked((prev) => ({ socket, status: change(prev.socket === socket ? prev.status : initialStatus(socket)) }));

    const handleConnect = () => {
      update(() => ({
        isConnected: true,
        isReconnecting: false,
        connectionError: null,
      }));
    };

    const handleDisconnect = () => {
      update(prev => ({
        ...prev,
        isConnected: false,
        connectionError: 'Connection lost',
      }));
    };

    // Reconnection is run by the socket's Manager (`socket.io`), which is
    // where its events fire; the socket itself never emits them.
    const handleReconnecting = () => {
      update(prev => ({
        ...prev,
        isReconnecting: true,
        connectionError: null,
      }));
    };

    const handleReconnectFailed = () => {
      update(prev => ({
        ...prev,
        isReconnecting: false,
        connectionError: 'Failed to reconnect',
      }));
    };

    const handleError = (error: Error) => {
      update(prev => ({
        ...prev,
        connectionError: error.message,
      }));
    };

    // Listen to socket events
    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('connect_error', handleError);
    socket.io.on('reconnect_attempt', handleReconnecting);
    socket.io.on('reconnect_failed', handleReconnectFailed);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('connect_error', handleError);
      socket.io.off('reconnect_attempt', handleReconnecting);
      socket.io.off('reconnect_failed', handleReconnectFailed);
    };
  }, [socket]);

  if (!socket) return NO_SOCKET;
  return tracked.socket === socket ? tracked.status : initialStatus(socket);
};

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/store/useAuthStore';

export interface ConnectionStatus {
  isConnected: boolean;
  isReconnecting: boolean;
  connectionError: string | null;
}

export const useConnectionStatus = () => {
  const [status, setStatus] = useState<ConnectionStatus>({
    isConnected: false,
    isReconnecting: false,
    connectionError: null,
  });

  const { socket } = useAuthStore();

  useEffect(() => {
    if (!socket) {
      setStatus({
        isConnected: false,
        isReconnecting: false,
        connectionError: null,
      });
      return;
    }

    const handleConnect = () => {
      setStatus({
        isConnected: true,
        isReconnecting: false,
        connectionError: null,
      });
    };

    const handleDisconnect = () => {
      setStatus(prev => ({
        ...prev,
        isConnected: false,
        connectionError: 'Connection lost',
      }));
    };

    // Reconnection is run by the socket's Manager (`socket.io`), which is
    // where its events fire; the socket itself never emits them.
    const handleReconnecting = () => {
      setStatus(prev => ({
        ...prev,
        isReconnecting: true,
        connectionError: null,
      }));
    };

    const handleReconnectFailed = () => {
      setStatus(prev => ({
        ...prev,
        isReconnecting: false,
        connectionError: 'Failed to reconnect',
      }));
    };

    const handleError = (error: Error) => {
      setStatus(prev => ({
        ...prev,
        connectionError: error.message,
      }));
    };

    // Set initial connection status
    setStatus({
      isConnected: socket.connected,
      isReconnecting: false,
      connectionError: null,
    });

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

  return status;
};
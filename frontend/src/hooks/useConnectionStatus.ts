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

    const handleReconnecting = () => {
      setStatus(prev => ({
        ...prev,
        isReconnecting: true,
        connectionError: null,
      }));
    };

    const handleReconnectError = () => {
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
    (socket as any).on('reconnecting', handleReconnecting);
    (socket as any).on('reconnect_error', handleReconnectError);
    socket.on('connect_error', handleError);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      (socket as any).off('reconnecting', handleReconnecting);
      (socket as any).off('reconnect_error', handleReconnectError);
      socket.off('connect_error', handleError);
    };
  }, [socket]);

  return status;
};
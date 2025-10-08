import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { useConnectionStatus } from '@/hooks/useConnectionStatus';

export const ConnectionStatus = () => {
  const { isConnected, isReconnecting, connectionError } = useConnectionStatus();

  if (isConnected && !connectionError) {
    return null; // Don't show anything when connected normally
  }

  return (
    <div className="fixed top-4 right-4 z-50">
      <div className={`
        flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
        ${isReconnecting ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30' : ''}
        ${!isConnected && !isReconnecting ? 'bg-red-500/20 text-red-300 border border-red-500/30' : ''}
      `}>
        {isReconnecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Reconnecting...
          </>
        ) : !isConnected ? (
          <>
            <WifiOff className="w-4 h-4" />
            {connectionError || 'Disconnected'}
          </>
        ) : (
          <>
            <Wifi className="w-4 h-4" />
            Connected
          </>
        )}
      </div>
    </div>
  );
};
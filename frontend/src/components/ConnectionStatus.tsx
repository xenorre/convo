import { Wifi, WifiOff, Loader2 } from "lucide-react";
import { useConnectionStatus } from "@/hooks/useConnectionStatus";

export const ConnectionStatus = () => {
  const { isConnected, isReconnecting, connectionError } =
    useConnectionStatus();

  if (isConnected && !connectionError) {
    return null; // Don't show anything when connected normally
  }

  return (
    <div
      role="status"
      className="min-w-0 shrink-0 border-b border-slate-700/50 bg-slate-900/80"
    >
      <div
        className={`
        flex min-w-0 items-center justify-center gap-2 px-4 py-2 text-xs font-medium [overflow-wrap:anywhere] [&>svg]:shrink-0
        ${isReconnecting ? "bg-yellow-500/10 text-yellow-300" : ""}
        ${!isConnected && !isReconnecting ? "bg-red-500/10 text-red-300" : ""}
      `}
      >
        {isReconnecting ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Reconnecting...
          </>
        ) : !isConnected ? (
          <>
            <WifiOff className="w-4 h-4" />
            {connectionError || "Disconnected"}
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

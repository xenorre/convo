import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { SettingsCard, SettingsSection } from "@/components/settings/SettingsSection";

const SHORTCUTS = [
  { keys: ["Enter"], action: "Send the message" },
  { keys: ["Esc"], action: "Clear the chat search, then close the open conversation" },
];

function connectionLabel(status: ReturnType<typeof useConnectionStatus>) {
  if (status.isReconnecting) return { text: "Reconnecting…", className: "text-yellow-300" };
  if (!status.isConnected) return { text: status.connectionError || "Disconnected", className: "text-red-300" };
  return { text: "Connected", className: "text-cyan-300" };
}

function AboutSettings() {
  const connection = connectionLabel(useConnectionStatus());

  return (
    <SettingsSection title="About" description="Version, connection and shortcuts">
      <SettingsCard title="Convo">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-slate-400">Version</dt>
          <dd className="text-slate-200">{__APP_VERSION__}</dd>
          <dt className="text-slate-400">Real-time connection</dt>
          <dd role="status" className={connection.className}>
            {connection.text}
          </dd>
        </dl>
      </SettingsCard>
      <SettingsCard title="Keyboard shortcuts">
        <ul className="space-y-3 text-sm">
          {SHORTCUTS.map(({ keys, action }) => (
            <li key={action} className="flex items-start gap-3">
              <span className="flex shrink-0 gap-1">
                {keys.map((key) => (
                  <kbd
                    key={key}
                    className="rounded-md border border-slate-600/60 bg-slate-900/60 px-2 py-0.5 font-mono text-xs text-slate-200"
                  >
                    {key}
                  </kbd>
                ))}
              </span>
              <span className="text-slate-300">{action}</span>
            </li>
          ))}
        </ul>
      </SettingsCard>
    </SettingsSection>
  );
}

export default AboutSettings;

import { useConnectionStatus } from "@/hooks/useConnectionStatus";
import { SettingsCard, SettingsSection } from "@/components/settings/SettingsSection";
import { APP_BUILD, isDifferentBuild, useServerBuild, type ServerBuild } from "@/services/appVersion";
import { formatFullTimestamp } from "@/utils/chatTimestamp";

const SHORTCUTS = [
  { keys: ["Enter"], action: "Send the message" },
  { keys: ["Esc"], action: "Clear the chat search, then close the open conversation" },
];

function connectionLabel(status: ReturnType<typeof useConnectionStatus>) {
  if (status.isReconnecting) return { text: "Reconnecting…", className: "text-yellow-300" };
  if (!status.isConnected) return { text: status.connectionError || "Disconnected", className: "text-red-300" };
  return { text: "Connected", className: "text-cyan-300" };
}

// "1.4.2 (abc1234)"; the commit only for Docker builds.
const describeBuild = ({ version, commit }: ServerBuild) =>
  commit ? `${version} (${commit.slice(0, 7)})` : version;

function AboutSettings() {
  const connection = connectionLabel(useConnectionStatus());
  const server = useServerBuild((state) => state.build);
  const isOutdated = server ? isDifferentBuild(server) : false;

  return (
    <SettingsSection title="About" description="Version, connection and shortcuts">
      <SettingsCard title="Convo">
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2 text-sm">
          <dt className="text-slate-400">Version</dt>
          <dd className="text-slate-200">{describeBuild(APP_BUILD)}</dd>
          {__APP_BUILT_AT__ && (
            <>
              <dt className="text-slate-400">Built</dt>
              <dd className="text-slate-200">{formatFullTimestamp(__APP_BUILT_AT__)}</dd>
            </>
          )}
          <dt className="text-slate-400">Server</dt>
          <dd className={isOutdated ? "text-yellow-300" : "text-slate-200"}>
            {server ? describeBuild(server) : "Not checked yet"}
            {isOutdated && (
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="ml-2 inline-flex min-h-11 cursor-pointer items-center text-cyan-300 underline underline-offset-2 hover:text-cyan-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
              >
                Reload to update
              </button>
            )}
          </dd>
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

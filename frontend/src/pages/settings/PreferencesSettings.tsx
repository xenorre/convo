import { SettingsCard, SettingsSection } from "@/components/settings/SettingsSection";
import { useSettingsStore, type MotionPreference } from "@/store/useSettingsStore";

const MOTION_OPTIONS: { value: MotionPreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "reduce", label: "Reduce" },
  { value: "full", label: "Full" },
];

// Native radios keep arrow-key navigation; labels reuse the Chats/Contacts switch look.
function PreferencesSettings() {
  const motion = useSettingsStore((state) => state.motion);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  return (
    <SettingsSection title="Preferences" description="How Convo behaves on this device">
      <SettingsCard
        title="Animations"
        description="Reduce turns off spinners, pop-up animations and smooth scrolling to new messages. System follows your device's accessibility setting."
      >
        <fieldset>
          <legend className="sr-only">Animations</legend>
          <div className="flex gap-1 rounded-xl border border-slate-700/50 bg-slate-900/50 p-1">
            {MOTION_OPTIONS.map(({ value, label }) => (
              <label
                key={value}
                className="flex min-h-11 min-w-0 flex-1 cursor-pointer items-center justify-center rounded-lg px-3 text-sm font-medium text-slate-400 transition-colors hover:bg-slate-800/80 hover:text-slate-200 has-checked:bg-cyan-500/15 has-checked:text-cyan-300 has-checked:shadow-sm has-checked:ring-1 has-checked:ring-inset has-checked:ring-cyan-400/15 has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-cyan-400"
              >
                <input
                  type="radio"
                  name="motion"
                  value={value}
                  checked={motion === value}
                  onChange={() => updateSettings({ motion: value })}
                  className="sr-only"
                />
                {label}
              </label>
            ))}
          </div>
        </fieldset>
      </SettingsCard>
    </SettingsSection>
  );
}

export default PreferencesSettings;

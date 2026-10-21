import ChoiceGroup from "@/components/settings/ChoiceGroup";
import { SettingsCard, SettingsSection } from "@/components/settings/SettingsSection";
import { useSettingsStore, type MotionPreference } from "@/store/useSettingsStore";

const MOTION_OPTIONS: { value: MotionPreference; label: string }[] = [
  { value: "system", label: "System" },
  { value: "reduce", label: "Reduce" },
  { value: "full", label: "Full" },
];

function PreferencesSettings() {
  const motion = useSettingsStore((state) => state.motion);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  return (
    <SettingsSection title="Preferences" description="How Convo behaves on this device">
      <SettingsCard
        title="Animations"
        description="Reduce turns off spinners, pop-up animations and smooth scrolling to new messages. System follows your device's accessibility setting."
      >
        <ChoiceGroup
          legend="Animations"
          name="motion"
          value={motion}
          options={MOTION_OPTIONS}
          onChange={(value) => updateSettings({ motion: value })}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export default PreferencesSettings;

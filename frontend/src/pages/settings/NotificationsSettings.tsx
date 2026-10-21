import { useState } from "react";
import { SettingsCard, SettingsSection } from "@/components/settings/SettingsSection";
import SettingToggle from "@/components/settings/SettingToggle";
import { useSettingsStore } from "@/store/useSettingsStore";
import { canShowSystemNotifications } from "@/utils/messageNotifications";

const permissionNow = (): NotificationPermission | "unsupported" =>
  canShowSystemNotifications() ? Notification.permission : "unsupported";

function systemNotificationHint(permission: NotificationPermission | "unsupported") {
  if (permission === "unsupported") return "This browser doesn't support system notifications.";
  if (permission === "denied") {
    return "Notifications are blocked for Convo. Allow them in your browser's site settings, then turn this on.";
  }
  return "Shows a system notification when a message arrives while Convo is in the background.";
}

function NotificationsSettings() {
  const { messageToasts, messagePreviews, desktopNotifications, updateSettings } = useSettingsStore();
  const [permission, setPermission] = useState(permissionNow);
  const systemEnabled = desktopNotifications && permission === "granted";

  const toggleSystemNotifications = async (enable: boolean) => {
    if (!enable) {
      updateSettings({ desktopNotifications: false });
      return;
    }
    let result = permissionNow();
    if (result === "default") result = await Notification.requestPermission();
    setPermission(result);
    updateSettings({ desktopNotifications: result === "granted" });
  };

  return (
    <SettingsSection title="Notifications" description="Alerts for new messages on this device">
      <SettingsCard title="Messages" description="Applies to chats you don't have open.">
        <div className="divide-y divide-slate-700/50">
          <SettingToggle
            label="In-app pop-ups"
            description="Show a pop-up with an Open chat button while you use Convo."
            checked={messageToasts}
            onChange={(value) => updateSettings({ messageToasts: value })}
          />
          <SettingToggle
            label="System notifications"
            description={systemNotificationHint(permission)}
            checked={systemEnabled}
            disabled={permission === "unsupported" || permission === "denied"}
            onChange={toggleSystemNotifications}
          />
          <SettingToggle
            label="Show message text"
            description="When off, alerts only say who wrote, not what they wrote."
            checked={messagePreviews}
            onChange={(value) => updateSettings({ messagePreviews: value })}
          />
        </div>
      </SettingsCard>
    </SettingsSection>
  );
}

export default NotificationsSettings;

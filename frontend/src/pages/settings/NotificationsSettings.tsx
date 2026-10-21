import { useState } from "react";
import { SettingsCard, SettingsSection } from "@/components/settings/SettingsSection";
import SettingToggle from "@/components/settings/SettingToggle";
import { useSettingsStore } from "@/store/useSettingsStore";
import { canShowSystemNotifications } from "@/utils/systemNotifications";

const permissionNow = (): NotificationPermission | "unsupported" =>
  canShowSystemNotifications() ? Notification.permission : "unsupported";

function systemNotificationHint(permission: NotificationPermission | "unsupported") {
  if (permission === "unsupported") return "This browser doesn't support system notifications.";
  if (permission === "denied") {
    return "Notifications are blocked for Convo. Allow them in your browser's site settings, then turn this on.";
  }
  return "For messages and friend requests that arrive while you're in another tab, another app, or Convo is minimized.";
}

function NotificationsSettings() {
  const { messageToasts, messagePreviews, desktopNotifications, friendRequestToasts, updateSettings } =
    useSettingsStore();
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
    <SettingsSection title="Notifications" description="Alerts for messages and friend requests on this device">
      <SettingsCard title="Messages" description="Applies to chats you don't have open.">
        <div className="divide-y divide-slate-700/50">
          <SettingToggle
            label="In-app pop-ups"
            description="Show a pop-up with an Open chat button while you use Convo."
            checked={messageToasts}
            onChange={(value) => updateSettings({ messageToasts: value })}
          />
          <SettingToggle
            label="Show message text"
            description="When off, alerts only say who wrote, not what they wrote."
            checked={messagePreviews}
            onChange={(value) => updateSettings({ messagePreviews: value })}
          />
        </div>
      </SettingsCard>
      <SettingsCard title="Friends">
        <SettingToggle
          label="Friend requests"
          description="Alert me when someone sends a friend request, in Convo and as a system notification if those are on."
          checked={friendRequestToasts}
          onChange={(value) => updateSettings({ friendRequestToasts: value })}
        />
      </SettingsCard>
      <SettingsCard title="Outside Convo">
        <SettingToggle
          label="System notifications"
          description={systemNotificationHint(permission)}
          checked={systemEnabled}
          disabled={permission === "unsupported" || permission === "denied"}
          onChange={toggleSystemNotifications}
        />
      </SettingsCard>
    </SettingsSection>
  );
}

export default NotificationsSettings;

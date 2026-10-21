import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type MotionPreference = "system" | "reduce" | "full";

interface DeviceSettings {
  // In-app pop-up for messages in chats that are not open.
  messageToasts: boolean;
  // Message text in pop-ups and system notifications.
  messagePreviews: boolean;
  // System notification while the Convo tab is in the background.
  desktopNotifications: boolean;
  motion: MotionPreference;
}

interface SettingsState extends DeviceSettings {
  updateSettings: (changes: Partial<DeviceSettings>) => void;
}

export const DEFAULT_DEVICE_SETTINGS: DeviceSettings = {
  messageToasts: true,
  messagePreviews: true,
  desktopNotifications: false,
  motion: "system",
};

// Per-device preferences, kept in localStorage. When storage is unavailable
// (private mode, blocked site data) they still work for the current visit.
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULT_DEVICE_SETTINGS,
      updateSettings: (changes) => set(changes),
    }),
    {
      name: "convo:device-settings",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ messageToasts, messagePreviews, desktopNotifications, motion }) => ({
        messageToasts,
        messagePreviews,
        desktopNotifications,
        motion,
      }),
    },
  ),
);

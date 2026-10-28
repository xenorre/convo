import { useSyncExternalStore } from "react";
import { useSettingsStore, type MotionPreference } from "@/store/useSettingsStore";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const systemMotionQuery = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : null;

export const resolveReducedMotion = (preference: MotionPreference, systemPrefersReduced: boolean) =>
  preference === "system" ? systemPrefersReduced : preference === "reduce";

const subscribeToSystemMotion = (onChange: () => void) => {
  const mediaQuery = systemMotionQuery();
  mediaQuery?.addEventListener("change", onChange);
  return () => mediaQuery?.removeEventListener("change", onChange);
};

// The operating system's setting, read straight from the media query.
const useSystemReducedMotion = (): boolean =>
  useSyncExternalStore(subscribeToSystemMotion, () => systemMotionQuery()?.matches ?? false, () => false);

// The device setting wins; "system" follows the operating system.
export const useReducedMotion = (): boolean => {
  const preference = useSettingsStore((state) => state.motion);
  return resolveReducedMotion(preference, useSystemReducedMotion());
};

// Keeps <html data-reduced-motion> in sync so CSS can drop animations.
// Runs before the first render, so there is no animated flash on load.
export function syncReducedMotionAttribute(root: HTMLElement = document.documentElement) {
  const mediaQuery = systemMotionQuery();
  const apply = () => {
    root.dataset.reducedMotion = String(
      resolveReducedMotion(useSettingsStore.getState().motion, mediaQuery?.matches ?? false),
    );
  };

  apply();
  mediaQuery?.addEventListener("change", apply);
  const unsubscribe = useSettingsStore.subscribe(apply);
  return () => {
    mediaQuery?.removeEventListener("change", apply);
    unsubscribe();
  };
}

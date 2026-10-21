import { useEffect, useState } from "react";
import { useSettingsStore, type MotionPreference } from "@/store/useSettingsStore";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

const systemMotionQuery = () =>
  typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia(REDUCED_MOTION_QUERY)
    : null;

export const resolveReducedMotion = (preference: MotionPreference, systemPrefersReduced: boolean) =>
  preference === "system" ? systemPrefersReduced : preference === "reduce";

const useSystemReducedMotion = (): boolean => {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () => systemMotionQuery()?.matches ?? false,
  );

  useEffect(() => {
    const mediaQuery = systemMotionQuery();
    if (!mediaQuery) return;

    setPrefersReducedMotion(mediaQuery.matches);
    const handleChange = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
    mediaQuery.addEventListener("change", handleChange);
    return () => mediaQuery.removeEventListener("change", handleChange);
  }, []);

  return prefersReducedMotion;
};

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

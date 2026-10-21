// True only while the user can actually see the app: the tab is shown and
// the browser window has focus. A visible window behind another app does not count.
export const isWindowInView = () =>
  document.visibilityState === "visible" && document.hasFocus();

// Calls back whenever the user may have come back to the window.
export function onWindowReturn(callback: () => void) {
  const handle = () => {
    if (isWindowInView()) callback();
  };
  window.addEventListener("focus", handle);
  document.addEventListener("visibilitychange", handle);
  return () => {
    window.removeEventListener("focus", handle);
    document.removeEventListener("visibilitychange", handle);
  };
}

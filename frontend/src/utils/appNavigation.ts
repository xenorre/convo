// Lets code outside React (e.g. a system notification's click handler) use
// the router. App registers React Router's navigate function on mount.
type Navigate = (to: string) => void;

let navigate: Navigate | null = null;

export function registerAppNavigate(fn: Navigate) {
  navigate = fn;
  return () => {
    if (navigate === fn) navigate = null;
  };
}

export function navigateInApp(to: string) {
  navigate?.(to);
}

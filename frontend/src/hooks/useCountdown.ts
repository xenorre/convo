import { useEffect, useState } from "react";

// Seconds left until something may be done again, e.g. sending another
// email; set it to start counting down.
export function useCountdown() {
  const [secondsLeft, setSecondsLeft] = useState(0);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((left) => left - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  return [secondsLeft, setSecondsLeft] as const;
}

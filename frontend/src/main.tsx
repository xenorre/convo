import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import App from "@/App.tsx";
import { BrowserRouter } from "react-router";
import { env } from "@/config/env";
import { syncReducedMotionAttribute } from "@/hooks/useReducedMotion";

syncReducedMotionAttribute();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

// Optional monitoring should not compete with rendering the application.
if (env.metricsEndpoint || env.healthEndpoint) {
  const startMonitoring = () => {
    void import("@/services/healthMonitor")
      .then(({ healthMonitor }) => {
        healthMonitor.startMonitoring();
      })
      .catch(() => {
        // An unavailable optional monitoring chunk must not disrupt the app.
      });
  };

  if (document.readyState === "complete") {
    startMonitoring();
  } else {
    window.addEventListener("load", startMonitoring, { once: true });
  }
}

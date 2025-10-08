import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/index.css";
import App from "@/App.tsx";
import { BrowserRouter } from "react-router";
import { healthMonitor } from "@/services/healthMonitor";

// Initialize health monitoring
healthMonitor.startMonitoring();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>
);

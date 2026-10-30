/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import { readFileSync } from "fs";

const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    // Set by the Docker build (see the Dockerfile); empty in development.
    __APP_COMMIT__: JSON.stringify(process.env.GIT_COMMIT ?? ""),
    __APP_BUILT_AT__: JSON.stringify(process.env.BUILD_DATE ?? ""),
  },
  plugins: [
    react(), 
    tailwindcss(),
    // Add bundle analyzer (only in production analysis)
    ...(process.env.ANALYZE ? [visualizer({
      filename: "dist/bundle-analysis.html",
      open: true,
      gzipSize: true,
      brotliSize: true,
    })] : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
      "@/components": path.resolve(import.meta.dirname, "./src/components"),
      "@/pages": path.resolve(import.meta.dirname, "./src/pages"),
      "@/store": path.resolve(import.meta.dirname, "./src/store"),
      "@/config": path.resolve(import.meta.dirname, "./src/config"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    include: ["src/**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}"],
  },
});

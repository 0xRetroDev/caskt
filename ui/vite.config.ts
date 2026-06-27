import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, the UI runs on 5173 and the backend on 8765. The proxy makes /api
// same-origin so the app uses one base path in dev and in production (where the
// backend serves the built UI from /).
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8765",
        changeOrigin: true,
      },
    },
  },
});

// Сборка для мобильного приложения (Capacitor): обычный статический SPA без серверной части.
// Веб-версия (Lovable / Cloudflare) по-прежнему собирается через vite.config.ts.
import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart({ spa: { enabled: true } }),
    viteReact(),
    tailwindcss(),
  ],
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // When building for Electron, assets must use relative paths (file://)
  base: mode === "electron" ? "./" : "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));

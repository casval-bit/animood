import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { fetchImage, sendImage } from "./server/imageProxy.js";

// En développement (npm run dev / electron:dev), même chemin que la fonction Vercel api/img.js : /api/img?u=<affiche>
const imageProxyDev = () => ({
  name: "animood-image-proxy-dev",
  configureServer(server) {
    server.middlewares.use("/api/img", async (req, res) => {
      sendImage(res, await fetchImage(new URL(req.url, "http://localhost").searchParams.get("u")));
    });
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [react(), tailwindcss(), imageProxyDev()],
  // When building for Electron, assets must use relative paths (file://)
  base: mode === "electron" ? "./" : "/",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
}));

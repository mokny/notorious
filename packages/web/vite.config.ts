import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      injectRegister: "auto",
      manifest: {
        name: "Notorious",
        short_name: "Notorious",
        description: "Objects, notes and a knowledge base for your whole team.",
        theme_color: "#0f172a",
        background_color: "#0f172a",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App-shell caching only: object/API data always goes to the network so
        // collaborators never see stale content from the cache.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
      },
      injectManifest: {
        swSrc: "src/push-sw.ts",
      },
      strategies: "injectManifest",
      srcDir: "src",
      filename: "push-sw.ts",
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: "http://localhost:4000", changeOrigin: true },
      "/ws": { target: "ws://localhost:4000", ws: true },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});

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
      injectManifest: {
        swSrc: "src/push-sw.ts",
        // App-shell caching only: object/API data always goes to the network so
        // collaborators never see stale content from the cache. Mermaid's
        // diagram-renderer bundle (and its cytoscape/d3/dagre/katex
        // dependencies, consolidated below into "vendor-diagrams") is
        // deliberately excluded - it's several MB, only needed the first time
        // someone opens a Mermaid/Math block, and reading+hashing it during
        // this precache-manifest build step is what ran a memory-constrained
        // server out of heap. It still loads fine on demand from the network.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        globIgnores: ["**/vendor-diagrams-*.js", "**/vendor-whiteboard-*.js"],
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
    // Off in production: generating sourcemaps for the minified
    // "vendor-diagrams" chunk (mermaid + friends) alone produced a ~12MB map
    // file, and that char-by-char source-position tracking through
    // minification is a major memory multiplier during the build - a
    // meaningful contributor to running memory-constrained servers out of
    // heap. `vite dev` is unaffected (it always serves unminified ESM with
    // its own inline sourcemaps, regardless of this setting).
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Mermaid pulls in cytoscape/d3/dagre/cose-bilkent for its various
          // diagram layouts, and KaTeX is its own sizeable renderer - grouping
          // them into one predictably-named chunk makes it possible to
          // exclude exactly that chunk from the PWA precache manifest (see
          // injectManifest.globIgnores above) instead of guessing at dozens
          // of auto-hashed per-diagram-type chunk names.
          if (/node_modules\/(mermaid|cytoscape|cose-bilkent|dagre|d3-?[\w-]*|katex)\//.test(id)) {
            return "vendor-diagrams";
          }
          // Excalidraw (the whiteboard block/object's drawing canvas) is its
          // own multi-MB bundle with a long dependency chain - same reasoning
          // as vendor-diagrams above: its own chunk, excluded from the PWA
          // precache manifest, loaded on demand only when a whiteboard block
          // actually renders (see WhiteboardBlock.tsx's dynamic import).
          if (/node_modules\/(@excalidraw|roughjs|perfect-freehand|points-on-curve|pica|image-blob-reduce)\//.test(id)) {
            return "vendor-whiteboard";
          }
        },
      },
    },
  },
});

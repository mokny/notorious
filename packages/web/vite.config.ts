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
        // Locks the installed PWA to portrait on platforms that honor this
        // (Android/Chrome). Browsers ignore it for regular tabbed browsing,
        // so the CSS overlay in globals.css handles that case instead.
        orientation: "portrait",
        start_url: "/",
        icons: [
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
        // Lets Android's native share sheet target the installed PWA (images,
        // videos, documents, links, plain text). POST/multipart is required
        // because file sharing isn't possible with a GET-based share target.
        // The "files" part name ("files") must match what
        // modules/shareTarget/routes.ts's intake route looks for when
        // distinguishing file parts from the url/title/text text fields.
        share_target: {
          action: "/api/v1/share-target/intake",
          method: "POST",
          enctype: "multipart/form-data",
          params: {
            title: "title",
            text: "text",
            url: "url",
            files: [
              {
                name: "files",
                accept: ["image/*", "video/*", "audio/*", "application/pdf", "text/*", "*/*"],
              },
            ],
          },
        },
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
        globIgnores: ["**/vendor-diagrams-*.js", "**/vendor-whiteboard-*.js", "**/vendor-canvas-shared-*.js"],
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
          // `roughjs` (and its own small dependency chain) renders the
          // "hand-drawn" look for BOTH Mermaid diagrams and Excalidraw
          // shapes, so it has to live in its own chunk rather than inside
          // either "vendor-diagrams" or "vendor-whiteboard": putting it in
          // either one makes that chunk statically depend on it while the
          // *other* chunk also imports it, which - combined with Excalidraw
          // depending on the real `mermaid` package for its optional
          // "convert Mermaid to a drawing" action - closes a loop ("vendor-x
          // imports vendor-y which imports vendor-x back") that Rollup
          // rejects outright as a circular chunk. A separate shared leaf
          // chunk that both of the others may depend on, but which depends
          // on neither, can't participate in that cycle.
          if (/node_modules\/(roughjs|hachure-fill|path-data-parser|points-on-path|points-on-curve)\//.test(id)) {
            return "vendor-canvas-shared";
          }
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
          //
          // `@excalidraw/mermaid-to-excalidraw` (Excalidraw's own optional
          // "convert Mermaid to a drawing" toolbar action) is deliberately
          // excluded from this bucket even though its path starts with
          // "@excalidraw/": Excalidraw's own built code only ever reaches it
          // through a dynamic `import()`, so it's better left as its own
          // small on-demand chunk (which then depends on "vendor-diagrams"
          // for the real `mermaid` package) instead of being dragged into
          // this eager chunk.
          if (
            /node_modules\/(perfect-freehand|pica|image-blob-reduce)\//.test(id) ||
            (/node_modules\/@excalidraw\//.test(id) && !/node_modules\/@excalidraw\/mermaid-to-excalidraw\//.test(id))
          ) {
            return "vendor-whiteboard";
          }
        },
      },
    },
  },
});

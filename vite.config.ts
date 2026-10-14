import { defineConfig } from "vite";

export default defineConfig({
  // Relative paths so the same build works on GitHub Pages, in Capacitor and offline.
  base: "./",
  build: {
    target: "es2020",
    assetsDir: "build",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 800,
  },
});

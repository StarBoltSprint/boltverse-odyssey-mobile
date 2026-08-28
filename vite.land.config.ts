import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

/** Phone-web boot for GH Pages. Relative assets. No TanStack / Vercel shell. */
const ghPages = process.env.GITHUB_PAGES === "1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: ghPages ? "/boltverse-odyssey-mobile/" : "./",
  publicDir: "public",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@tanstack/react-start": path.resolve(__dirname, "src/shims/tanstack-react-start.ts"),
    },
  },
  build: {
    outDir: "dist/land",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "land.html"),
    },
  },
});

import { copyFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** GitHub Pages serves index.html at the play URL. land.html alone 404s the root. */
function landPagesIndex(): Plugin {
  return {
    name: "land-pages-index",
    closeBundle() {
      const dir = path.resolve(__dirname, "dist/land");
      const land = path.join(dir, "land.html");
      try {
        copyFileSync(land, path.join(dir, "index.html"));
        copyFileSync(land, path.join(dir, "404.html"));
        writeFileSync(path.join(dir, ".nojekyll"), "");
      } catch {
        /* incomplete build */
      }
    },
  };
}

/** Phone-web boot for GH Pages. Relative assets. No TanStack / Vercel shell. */
const ghPages = process.env.GITHUB_PAGES === "1";

export default defineConfig({
  plugins: [react(), tailwindcss(), landPagesIndex()],
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

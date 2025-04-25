import { defineConfig } from "vite";

export default defineConfig({
  root: "src", // project root (default)
  build: {
    outDir: "../public", // emit built HTML & assets into Pages bucket
    emptyOutDir: false,
    assetsDir: "assets", // JS/CSS go into public/assets/
  },
});

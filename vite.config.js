import { defineConfig } from "vite";
import { resolve } from "path";
import fg from "fast-glob";

function postEntries() {
  // grab every *.html under src/posts/ … at any depth
  const files = fg.sync("src/posts/**/*.html");
  return files.reduce((acc, file) => {
    // key without extension, keeps folder structure: posts/2025/koopman
    const key = file.replace(/^src\//, "").replace(/\.html$/, "");
    acc[key] = resolve(__dirname, file);
    return acc;
  }, {});
}

export default defineConfig(({ command }) => ({
  root: "src", // HTML lives here
  build: {
    outDir: "../public", // final Pages bucket
    emptyOutDir: false, // clears only public/*
    assetsDir: "assets", // JS/CSS land in /assets
    rollupOptions: {
      input: {
        main: resolve(__dirname, "src/index.html"),
        ...postEntries(),
      },
      output: {
        // hashed names for *all* emitted assets, incl. CSS
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  optimizeDeps: { include: ["axios"] }, // 👈 forces an ESM pre-bundle
}));

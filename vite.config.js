import { defineConfig } from "vite";
import { resolve } from "path";
import fg from "fast-glob";

function htmlEntries(globs) {
  return fg.sync(globs).reduce((acc, file) => {
    // key without extension, keeps folder structure, e.g. posts/foo or media/bar
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
        writing: resolve(__dirname, "src/writing.html"),
        ...htmlEntries(["src/posts/**/*.html", "src/media/**/*.html"]),
      },
      output: {
        // hashed names for *all* emitted assets, incl. CSS
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
}));

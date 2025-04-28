import { defineConfig } from "vite";

export default defineConfig({
  root: "src", // HTML lives here
  build: {
    outDir: "../public", // final Pages bucket
    emptyOutDir: false, // clears only public/*
    assetsDir: "assets", // JS/CSS land in /assets
    rollupOptions: {
      output: {
        // hashed names for *all* emitted assets, incl. CSS
        assetFileNames: "assets/[name]-[hash][extname]",
        chunkFileNames: "assets/[name]-[hash].js",
        entryFileNames: "assets/[name]-[hash].js",
      },
    },
  },
  optimizeDeps: { include: ["axios"] }, // 👈 forces an ESM pre-bundle
});

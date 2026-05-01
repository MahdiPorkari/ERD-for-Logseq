import { defineConfig } from "vite";
import logseqPlugin from "vite-plugin-logseq";

export default defineConfig({
  plugins: [logseqPlugin()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "es2020",
  },
  server: {
    host: "127.0.0.1",
    port: 8080,
    cors: true,
  },
});

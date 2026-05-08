import { defineConfig } from "vitest/config";

// Standalone config so vitest does not pick up vite-plugin-logseq
// (the plugin only works in middleware mode and crashes vitest at startup).
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

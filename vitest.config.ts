import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    // Integration tests share one PGlite instance per file; keep files isolated.
    pool: "forks",
    testTimeout: 30_000,
    // parallel PGlite startups + the full migration set can exceed the 10s
    // default hook timeout on a busy machine
    hookTimeout: 30_000,
  },
});

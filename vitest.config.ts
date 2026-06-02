import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@personal-agent/shared": new URL(
        "./packages/shared/src/index.ts",
        import.meta.url
      ).pathname
    }
  },
  test: {
    environment: "node",
    globals: false,
    include: ["apps/**/*.test.ts"],
    fileParallelism: false,
    exclude: ["**/node_modules/**", "**/dist/**"]
  }
});

import { defineConfig } from "vitest/config"
import { fileURLToPath } from "url"
import path from "path"

const coreSrc = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../core/src",
)

export default defineConfig({
  resolve: {
    alias: [
      {
        find: "@babulfish/core/engine/testing",
        replacement: path.join(coreSrc, "engine/testing/index.ts"),
      },
      {
        find: "@babulfish/core/testing",
        replacement: path.join(coreSrc, "testing/index.ts"),
      },
      {
        find: /^@babulfish\/core$/,
        replacement: path.join(coreSrc, "index.ts"),
      },
    ],
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: ["./vitest.setup.ts"],
  },
})

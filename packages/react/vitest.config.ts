import { defineConfig } from "vitest/config"
import { fileURLToPath } from "node:url"
import path from "node:path"

const coreSrc = fileURLToPath(new URL("../core/src", import.meta.url))
const coreSrcFile = (relative: string) => path.join(coreSrc, relative)
const jestDomSetup = fileURLToPath(
  new URL(await import.meta.resolve("@testing-library/jest-dom/vitest")),
)

export default defineConfig({
  resolve: {
    alias: {
      "@babulfish/core/engine/testing": coreSrcFile("engine/testing/index.ts"),
      "@babulfish/core/testing": coreSrcFile("testing/index.ts"),
      "@babulfish/core": coreSrcFile("index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    setupFiles: [jestDomSetup],
  },
})

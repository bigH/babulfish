import path from "node:path"
import { defineConfig } from "vitest/config"

const coreSrc = path.resolve(__dirname, "../core/src")
const coreEntry = (...segments: string[]) => path.join(coreSrc, ...segments)
const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
}
const buildCrossOriginIsolationHeaders = () => ({ ...crossOriginIsolationHeaders })

export default defineConfig({
  resolve: {
    alias: {
      "@babulfish/core": coreEntry("index.ts"),
      "@babulfish/core/engine": coreEntry("engine", "index.ts"),
      "@babulfish/core/dom": coreEntry("dom", "index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts"],
  },
  server: {
    headers: buildCrossOriginIsolationHeaders(),
  },
  preview: {
    headers: buildCrossOriginIsolationHeaders(),
  },
})

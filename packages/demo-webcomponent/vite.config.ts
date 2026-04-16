import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vitest/config"

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const coreSrc = path.resolve(packageDir, "../core/src")
const coreEntry = (...segments: string[]) => path.join(coreSrc, ...segments)
const crossOriginIsolationHeaders = Object.freeze({
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
})

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
    headers: { ...crossOriginIsolationHeaders },
  },
  preview: {
    headers: { ...crossOriginIsolationHeaders },
  },
})

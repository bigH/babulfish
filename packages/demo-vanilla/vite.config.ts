import path from "node:path"
import { fileURLToPath } from "node:url"
import { defineConfig } from "vite"

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const coreSrc = path.resolve(packageDir, "../core/src")
const coreEntry = (...segments: string[]) => path.join(coreSrc, ...segments)
const crossOriginIsolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
}

export default defineConfig({
  resolve: {
    alias: {
      "@babulfish/core": coreEntry("index.ts"),
      "@babulfish/core/engine": coreEntry("engine", "index.ts"),
    },
  },
  server: { headers: crossOriginIsolationHeaders },
  preview: { headers: crossOriginIsolationHeaders },
})

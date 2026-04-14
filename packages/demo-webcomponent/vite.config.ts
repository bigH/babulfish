import { defineConfig } from "vite"
import path from "node:path"

const coreSrc = path.resolve(__dirname, "../core/src")
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
      "@babulfish/core/dom": coreEntry("dom", "index.ts"),
    },
  },
  server: {
    headers: crossOriginIsolationHeaders,
  },
  preview: {
    headers: crossOriginIsolationHeaders,
  },
})

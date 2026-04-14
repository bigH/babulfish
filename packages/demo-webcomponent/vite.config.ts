import { defineConfig } from "vite"
import path from "node:path"

const coreSrc = path.resolve(__dirname, "../core/src")

export default defineConfig({
  resolve: {
    alias: {
      "@babulfish/core": path.join(coreSrc, "index.ts"),
      "@babulfish/core/engine": path.join(coreSrc, "engine/index.ts"),
      "@babulfish/core/dom": path.join(coreSrc, "dom/index.ts"),
    },
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
})

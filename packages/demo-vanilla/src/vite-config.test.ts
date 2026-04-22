// @vitest-environment node

import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import viteConfig from "../vite.config"

const packageDir = path.dirname(fileURLToPath(import.meta.url))
const coreSrc = path.resolve(packageDir, "..", "..", "core", "src")

const expectedHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
}

describe("demo-vanilla vite config", () => {
  it("keeps source aliases pointed at core source entrypoints", () => {
    expect(viteConfig.resolve?.alias).toMatchObject({
      "@babulfish/core": path.resolve(coreSrc, "index.ts"),
      "@babulfish/core/engine": path.resolve(coreSrc, "engine", "index.ts"),
    })
  })

  it("applies the cross-origin isolation headers to dev and preview", () => {
    expect(viteConfig.server?.headers).toMatchObject(expectedHeaders)
    expect(viteConfig.preview?.headers).toMatchObject(expectedHeaders)
  })
})

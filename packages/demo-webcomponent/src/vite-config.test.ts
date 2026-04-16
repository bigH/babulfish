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

describe("demo-webcomponent vite config", () => {
  it("keeps source aliases pointed at core source entrypoints", () => {
    expect(viteConfig.resolve?.alias).toMatchObject({
      "@babulfish/core": path.resolve(coreSrc, "index.ts"),
      "@babulfish/core/engine": path.resolve(coreSrc, "engine", "index.ts"),
      "@babulfish/core/dom": path.resolve(coreSrc, "dom", "index.ts"),
    })
  })

  it("applies the same cross-origin isolation headers to dev and preview", () => {
    expect(viteConfig.server?.headers).toEqual(viteConfig.preview?.headers)
    expect(viteConfig.server?.headers).toMatchObject(expectedHeaders)
    expect(viteConfig.server?.headers).not.toBe(viteConfig.preview?.headers)
  })

  it("keeps vitest running in jsdom against the package test files", () => {
    expect(viteConfig.test?.environment).toBe("jsdom")
    expect(viteConfig.test?.include).toEqual(["src/**/*.test.ts"])
  })
})

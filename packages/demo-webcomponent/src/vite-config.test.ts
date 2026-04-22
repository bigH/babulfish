// @vitest-environment node

import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import viteConfig from "../vite.config"

const coreSrc = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../core/src")

const expectedAliases = {
  "@babulfish/core": path.resolve(coreSrc, "index.ts"),
  "@babulfish/core/engine": path.resolve(coreSrc, "engine", "index.ts"),
}

const expectedHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
}

describe("demo-webcomponent vite config", () => {
  it("keeps source aliases pointed at core source entrypoints", () => {
    expect(viteConfig.resolve?.alias).toMatchObject(expectedAliases)
  })

  it("applies the same cross-origin isolation headers to dev and preview", () => {
    expect(viteConfig.server?.headers).toMatchObject(expectedHeaders)
    expect(viteConfig.preview?.headers).toMatchObject(expectedHeaders)
  })

  it("keeps vitest running in jsdom against the package test files", () => {
    expect(viteConfig.test?.environment).toBe("jsdom")
    expect(viteConfig.test?.include).toEqual(["src/**/*.test.ts"])
  })
})

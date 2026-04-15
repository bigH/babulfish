// @vitest-environment node

import path from "node:path"
import { describe, expect, it } from "vitest"

import viteConfig from "../vite.config"

const coreSrc = path.resolve(__dirname, "..", "..", "core", "src")

const expectedHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
}

function readAliasEntries(aliases: unknown): Record<string, string> {
  if (!aliases || typeof aliases !== "object" || Array.isArray(aliases)) {
    throw new Error("Expected demo-webcomponent vite config to define aliases")
  }

  return aliases as Record<string, string>
}

describe("demo-webcomponent vite config", () => {
  it("keeps source aliases pointed at core source entrypoints", () => {
    const aliases = readAliasEntries(viteConfig.resolve?.alias)

    expect(aliases["@babulfish/core"]).toBe(path.resolve(coreSrc, "index.ts"))
    expect(aliases["@babulfish/core/engine"]).toBe(path.resolve(coreSrc, "engine", "index.ts"))
    expect(aliases["@babulfish/core/dom"]).toBe(path.resolve(coreSrc, "dom", "index.ts"))
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

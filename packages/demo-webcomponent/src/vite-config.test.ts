// @vitest-environment node

import path from "node:path"
import type { AliasOptions } from "vite"
import { describe, expect, it } from "vitest"

import viteConfig from "../vite.config"

const expectedHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
}

function expectAliasTarget(alias: unknown, relativePath: string): void {
  expect(alias).toBe(path.resolve(__dirname, "..", "..", "core", "src", relativePath))
}

function readAliasEntries(aliases: AliasOptions | undefined): Record<string, string> {
  if (!aliases) {
    throw new Error("Expected demo-webcomponent vite config to define aliases")
  }

  if (!Array.isArray(aliases)) {
    return aliases as Record<string, string>
  }

  return Object.fromEntries(
    aliases
      .filter((alias): alias is { find: string; replacement: string } => typeof alias.find === "string")
      .map((alias) => [alias.find, alias.replacement]),
  )
}

describe("demo-webcomponent vite config", () => {
  it("keeps source aliases pointed at core source entrypoints", () => {
    const aliases = readAliasEntries(viteConfig.resolve?.alias)

    expectAliasTarget(aliases["@babulfish/core"], "index.ts")
    expectAliasTarget(aliases["@babulfish/core/engine"], path.join("engine", "index.ts"))
    expectAliasTarget(aliases["@babulfish/core/dom"], path.join("dom", "index.ts"))
  })

  it("applies the same cross-origin isolation headers to dev and preview", () => {
    expect(viteConfig.server?.headers).toEqual(viteConfig.preview?.headers)
    expect(viteConfig.server?.headers).toMatchObject(expectedHeaders)
  })

  it("keeps vitest running in jsdom against the package test files", () => {
    expect(viteConfig.test?.environment).toBe("jsdom")
    expect(viteConfig.test?.include).toEqual(["src/**/*.test.ts"])
  })
})

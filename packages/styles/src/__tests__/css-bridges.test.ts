import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const CSS_BRIDGE_IMPORT = '@import "@babulfish/styles/css";'

const CSS_BRIDGES = [
  ["@babulfish/react/css", new URL("../../../react/src/babulfish.css", import.meta.url)],
  ["babulfish/css", new URL("../../../babulfish/src/babulfish.css", import.meta.url)],
] as const

function normalizeCssBridge(source: string) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
}

describe("published CSS bridge entrypoints", () => {
  it.each(CSS_BRIDGES)(
    "keeps %s as a pure bridge to @babulfish/styles/css",
    (_specifier, url) => {
      expect(normalizeCssBridge(readFileSync(url, "utf8"))).toBe(CSS_BRIDGE_IMPORT)
    },
  )
})

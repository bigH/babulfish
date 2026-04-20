import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const EXPECTED_BRIDGE_SOURCE = [
  '/* Keep this file local so the published "./css" export stays a CSS asset. */',
  '@import "@babulfish/styles/css";',
  "",
].join("\n")

const CSS_BRIDGES = [
  ["@babulfish/react/css", new URL("../../../react/src/babulfish.css", import.meta.url)],
  ["babulfish/css", new URL("../../../babulfish/src/babulfish.css", import.meta.url)],
] as const

describe("published CSS bridge entrypoints", () => {
  it.each(CSS_BRIDGES)(
    "keeps %s as the local bridge to @babulfish/styles/css",
    (_specifier, url) => {
      expect(readFileSync(url, "utf8")).toBe(EXPECTED_BRIDGE_SOURCE)
    },
  )
})

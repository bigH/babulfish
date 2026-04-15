// @vitest-environment node

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import tsupConfig from "../../tsup.config.ts"

describe("core tsup config", () => {
  it("keeps its configured entrypoints aligned with package exports", () => {
    const packageJsonUrl = new URL("../../package.json", import.meta.url)
    const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8")) as {
      exports: Record<string, unknown>
    }
    const exportedEntryKeys = Object.keys(packageJson.exports)
      .map((subpath) => (subpath === "." ? "index" : subpath.slice(2)))
      .sort()
    const configuredEntryKeys = Object.keys(tsupConfig.entry).sort()

    expect(configuredEntryKeys).toEqual(exportedEntryKeys)
  })
})

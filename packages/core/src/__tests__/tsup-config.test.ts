// @vitest-environment node

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import tsupConfig from "../../tsup.config.ts"

function readPackageExports(): Record<string, unknown> {
  const packageJsonUrl = new URL("../../package.json", import.meta.url)
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8")) as {
    exports: Record<string, unknown>
  }

  return packageJson.exports
}

function toEntryKey(subpath: string): string {
  return subpath === "." ? "index" : subpath.slice(2)
}

describe("core tsup config", () => {
  it("keeps its configured entrypoints aligned with package exports", () => {
    const exportsMap = readPackageExports()
    const exportedEntryKeys = Object.keys(exportsMap).map(toEntryKey).sort()
    const configuredEntryKeys = Object.keys(tsupConfig.entry).sort()

    expect(configuredEntryKeys).toEqual(exportedEntryKeys)
  })
})

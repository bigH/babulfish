// @vitest-environment node

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import tsupConfig from "../../tsup.config.ts"

type PackageExportTarget = {
  import: string
  types: string
}

function readPackageExports(): Record<string, PackageExportTarget> {
  const packageJsonUrl = new URL("../../package.json", import.meta.url)
  const packageJson = JSON.parse(readFileSync(packageJsonUrl, "utf8")) as {
    exports: Record<string, PackageExportTarget>
  }

  return packageJson.exports
}

function expectedExportsFromEntries(entries: Record<string, string>): Record<string, PackageExportTarget> {
  return Object.fromEntries(
    Object.keys(entries).map((entryKey) => [
      entryKey === "index" ? "." : `./${entryKey}`,
      {
        import: `./dist/${entryKey}.js`,
        types: `./dist/${entryKey}.d.ts`,
      },
    ]),
  )
}

describe("core tsup config", () => {
  it("keeps package exports aligned with configured entrypoints and dist filenames", () => {
    expect(readPackageExports()).toEqual(expectedExportsFromEntries(tsupConfig.entry))
  })
})

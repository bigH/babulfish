// @vitest-environment node

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import tsupConfig from "../../tsup.config.ts"

type PackageExportTarget = {
  import: string
  types: string
}

type PackageJson = {
  exports: Record<string, PackageExportTarget>
  peerDependencies?: Record<string, string>
}

function readPackageJson(): PackageJson {
  const packageJsonUrl = new URL("../../package.json", import.meta.url)
  return JSON.parse(readFileSync(packageJsonUrl, "utf8")) as PackageJson
}

function readPackageExports(): Record<string, PackageExportTarget> {
  return readPackageJson().exports
}

function readPeerDependencies(): string[] {
  return Object.keys(readPackageJson().peerDependencies ?? {})
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

  it("keeps external packages aligned with peer dependencies", () => {
    expect(tsupConfig.external).toEqual(readPeerDependencies())
  })
})

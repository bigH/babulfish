// @vitest-environment node

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { buildEntryPointsFromPackageExports, type CorePackageJson } from "../../tsup-package-contract"
import { coreTsupConfig } from "../../tsup.config"

function readPackageJson(): CorePackageJson {
  const packageJsonUrl = new URL("../../package.json", import.meta.url)
  return JSON.parse(readFileSync(packageJsonUrl, "utf8")) as CorePackageJson
}

function expectedExportsFromEntries(
  entries: Record<string, string>,
): CorePackageJson["exports"] {
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
  it("derives entrypoints from package export subpaths using the package contract", () => {
    expect(
      buildEntryPointsFromPackageExports({
        ".": {
          import: "./dist/index.js",
          types: "./dist/index.d.ts",
        },
        "./engine/testing": {
          import: "./dist/engine/testing.js",
          types: "./dist/engine/testing.d.ts",
        },
      }),
    ).toEqual({
      index: "src/index.ts",
      "engine/testing": "src/engine/testing/index.ts",
    })
  })

  it("keeps package exports aligned with configured entrypoints and dist filenames", () => {
    const packageJson = readPackageJson()

    expect(packageJson.exports).toEqual(expectedExportsFromEntries(coreTsupConfig.entry))
  })

  it("keeps external packages aligned with peer dependencies", () => {
    const packageJson = readPackageJson()

    expect(coreTsupConfig.external).toEqual(Object.keys(packageJson.peerDependencies ?? {}))
  })
})

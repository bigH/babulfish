// @vitest-environment node

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { reactTsupConfig } from "../../tsup.config"

type PackageExportTarget = {
  import: string
  types: string
}

type PackageJson = {
  exports: Record<string, string | PackageExportTarget>
}

function readPackageJson(): PackageJson {
  const packageJsonUrl = new URL("../../package.json", import.meta.url)
  return JSON.parse(readFileSync(packageJsonUrl, "utf8")) as PackageJson
}

function readPackageExports(): Record<string, string | PackageExportTarget> {
  return readPackageJson().exports
}

describe("react tsup config", () => {
  it("keeps the package root export aligned with the configured entrypoint and dist filenames", () => {
    expect(readPackageExports()["."]).toEqual({
      import: "./dist/index.js",
      types: "./dist/index.d.ts",
    })

    expect(reactTsupConfig.entry).toEqual({
      index: "src/index.ts",
    })
  })

  it("keeps the css export on the local bridge file", () => {
    expect(readPackageExports()["./css"]).toBe("./src/babulfish.css")
  })
})

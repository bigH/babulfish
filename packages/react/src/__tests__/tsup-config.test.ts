// @vitest-environment node

import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

type PackageExportTarget = {
  import: string
  types: string
}

type PackageJson = {
  exports: Record<string, string | PackageExportTarget>
}

type ReactTsupConfig = {
  entry: Record<string, string>
}

async function readReactTsupConfig(): Promise<ReactTsupConfig> {
  const tsupConfigUrl = new URL("../../tsup.config.ts", import.meta.url)
  const tsupConfigModule = (await import(tsupConfigUrl.href)) as {
    reactTsupConfig: ReactTsupConfig
  }

  return tsupConfigModule.reactTsupConfig
}

function readPackageJson(): PackageJson {
  const packageJsonUrl = new URL("../../package.json", import.meta.url)
  return JSON.parse(readFileSync(packageJsonUrl, "utf8")) as PackageJson
}

function readPackageExports(): Record<string, string | PackageExportTarget> {
  return readPackageJson().exports
}

describe("react tsup config", () => {
  it("keeps the package root export aligned with the configured entrypoint and dist filenames", async () => {
    expect(readPackageExports()["."]).toEqual({
      import: "./dist/index.js",
      types: "./dist/index.d.ts",
    })

    const reactTsupConfig = await readReactTsupConfig()

    expect(reactTsupConfig.entry).toEqual({
      index: "src/index.ts",
    })
  })

  it("keeps the css export on the local bridge file", () => {
    expect(readPackageExports()["./css"]).toBe("./src/babulfish.css")
  })
})

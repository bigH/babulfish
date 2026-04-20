import { readFileSync } from "node:fs"
import type { Options } from "tsup"
import { defineConfig } from "tsup"
import { buildEntryPointsFromPackageExports, type CorePackageJson } from "./tsup-package-contract"

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as CorePackageJson

const coreEntryPoints = buildEntryPointsFromPackageExports(packageJson.exports)

const coreExternalPackages = Object.keys(packageJson.peerDependencies ?? {})

const coreTsupConfig = {
  entry: coreEntryPoints,
  clean: true,
  format: ["esm"],
  dts: true,
  sourcemap: true,
  external: coreExternalPackages,
  treeshake: true,
  outDir: "dist",
} satisfies Options

export default defineConfig(coreTsupConfig)
export { coreTsupConfig }

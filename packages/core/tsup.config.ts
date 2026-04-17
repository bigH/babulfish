import { readFileSync } from "node:fs"
import type { Options } from "tsup"
import { defineConfig } from "tsup"

type PackageExportTarget = {
  import: string
  types: string
}

type PackageJson = {
  exports: Record<string, PackageExportTarget>
  peerDependencies?: Record<string, string>
}

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as PackageJson

function toEntryKey(exportKey: string): string {
  if (exportKey === ".") return "index"
  if (!exportKey.startsWith("./")) {
    throw new Error(`Unsupported export key in packages/core/package.json: ${exportKey}`)
  }

  return exportKey.slice(2)
}

function expectedExportTarget(entryKey: string): PackageExportTarget {
  return {
    import: `./dist/${entryKey}.js`,
    types: `./dist/${entryKey}.d.ts`,
  }
}

function toSourcePath(entryKey: string): string {
  if (entryKey === "index") return "src/index.ts"
  return `src/${entryKey}/index.ts`
}

const coreEntryPoints = Object.fromEntries(
  Object.entries(packageJson.exports).map(([exportKey, target]) => {
    const entryKey = toEntryKey(exportKey)
    const expectedTarget = expectedExportTarget(entryKey)

    if (target.import !== expectedTarget.import || target.types !== expectedTarget.types) {
      throw new Error(
        `packages/core/package.json export ${exportKey} must point to ${expectedTarget.import} and ${expectedTarget.types}`,
      )
    }

    return [entryKey, toSourcePath(entryKey)]
  }),
)

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

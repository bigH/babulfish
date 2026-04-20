export type PackageExportTarget = {
  import: string
  types: string
}

export type CorePackageJson = {
  exports: Record<string, PackageExportTarget>
  peerDependencies?: Record<string, string>
}

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

export function buildEntryPointsFromPackageExports(
  packageExports: Record<string, PackageExportTarget>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(packageExports).map(([exportKey, target]) => {
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
}

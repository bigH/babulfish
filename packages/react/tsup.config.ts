import { readFileSync } from "node:fs"
import { defineConfig } from "tsup"

type PackageJson = {
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as PackageJson

const external = [
  ...Object.keys(packageJson.peerDependencies ?? {}),
  ...Object.keys(packageJson.dependencies ?? {}),
]

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  clean: true,
  format: ["esm"],
  dts: true,
  sourcemap: true,
  external,
  treeshake: true,
  outDir: "dist",
})

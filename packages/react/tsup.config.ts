import type { Options } from "tsup"
import { defineConfig } from "tsup"

const reactTsupConfig = {
  entry: {
    index: "src/index.ts",
  },
  clean: true,
  format: ["esm"],
  dts: true,
  sourcemap: true,
  treeshake: true,
  outDir: "dist",
} satisfies Options

export default defineConfig(reactTsupConfig)
export { reactTsupConfig }

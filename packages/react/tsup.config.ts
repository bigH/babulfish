import { defineConfig } from "tsup"

export default defineConfig({
  entry: {
    index: "src/index.ts",
  },
  clean: true,
  format: ["esm"],
  dts: true,
  sourcemap: true,
  external: ["react", "@babulfish/core", "@babulfish/styles"],
  treeshake: true,
  outDir: "dist",
})

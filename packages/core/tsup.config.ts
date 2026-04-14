import { defineConfig } from "tsup"

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      engine: "src/engine/index.ts",
      dom: "src/dom/index.ts",
      "engine/testing": "src/engine/testing/index.ts",
      testing: "src/testing/index.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    external: ["@huggingface/transformers"],
    treeshake: true,
    outDir: "dist",
  },
])

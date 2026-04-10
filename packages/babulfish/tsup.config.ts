import { defineConfig } from "tsup"

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      engine: "src/engine/index.ts",
      dom: "src/dom/index.ts",
      react: "src/react/index.ts",
    },
    format: ["esm"],
    dts: true,
    sourcemap: true,
    external: ["react", "react-dom", "@huggingface/transformers"],
    treeshake: true,
    outDir: "dist",
  },
])

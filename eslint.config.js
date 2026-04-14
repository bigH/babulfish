export default [
  {
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/engine/pipeline-loader.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@huggingface/transformers",
              message:
                "Import from @babulfish/core/engine/pipeline-loader instead. " +
                "pipeline-loader.ts is the ONLY file that may import @huggingface/transformers.",
            },
          ],
        },
      ],
    },
  },
]

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import path from "node:path"
import { describe, it } from "node:test"
import { fileURLToPath } from "node:url"

import {
  createRunMetadata,
  formatResultSummary,
  parseArgs,
} from "./webgpu-eval.mjs"

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

describe("webgpu eval cli", () => {
  it("defaults local report runs to targeted and general", () => {
    const options = parseArgs([])

    assert.deepEqual(options.models, ["qwen-3-0.6b"])
    assert.deepEqual(options.filters, { split: ["targeted", "general"] })
    assert.equal(options.holdoutReason, null)
    assert.equal(options.referencesExposed, false)
    assert.match(options.outputDir, /\.evals[/\\]web-gpu-/)
  })

  it("allows holdout runs without a reason", () => {
    const options = parseArgs(["--split", "holdout", "--references-exposed"])

    assert.deepEqual(options.filters, { split: ["holdout"] })
    assert.equal(options.holdoutReason, null)
    assert.equal(options.referencesExposed, true)
  })

  it("records auditable run metadata for selected holdout runs", () => {
    const options = parseArgs([
      "--model",
      "gemma-3-1b-it",
      "--split",
      "holdout",
      "--references-exposed",
    ])
    const metadata = createRunMetadata("gemma-3-1b-it", options)

    assert.equal(metadata.runner, "webgpu-eval-cli")
    assert.equal(metadata.modelId, "gemma-3-1b-it")
    assert.deepEqual(metadata.filters, { split: ["holdout"] })
    assert.equal(metadata.reason, null)
    assert.equal(metadata.referencesExposed, true)
    assert.match(metadata.timestamp, /^\d{4}-\d{2}-\d{2}T/)
  })

  it("prints raw and clean headline scores in the terminal summary", () => {
    const summary = formatResultSummary(
      {
        pass: false,
        models: [
          {
            modelId: "qwen-3-0.6b",
            score: 0.1234,
            cleanHeadlineScore: { score: 1 },
          },
        ],
      },
      [path.resolve(".evals/web-gpu-test/qwen-3-0.6b.json")],
    )

    assert.match(summary, /FAIL WebGPU eval: 1 model\(s\)/)
    assert.match(summary, /qwen-3-0\.6b=raw:0\.123\/clean:1\.000/)
  })
})

describe("webgpu eval schema policy", () => {
  it("records the PR 3 provenance and public-score gates", () => {
    const schema = JSON.parse(
      readFileSync(path.join(repoRoot, "evals/translation/schema.json"), "utf8"),
    )
    const schemaText = JSON.stringify(schema)
    const provenance = schema.$defs.provenance.properties

    assert.equal(provenance.authorId.minLength, 1)
    assert.equal(provenance.createdAt.pattern, "^\\d{4}-\\d{2}-\\d{2}$")
    assert.equal(provenance.referenceReviewDate.pattern, "^\\d{4}-\\d{2}-\\d{2}$")
    assert.equal(provenance.technicalReviewDate.pattern, "^\\d{4}-\\d{2}-\\d{2}$")
    assert.match(schemaText, /targeted/)
    assert.match(schemaText, /general/)
    assert.match(schemaText, /holdout/)
    assert.match(schemaText, /holdout_approved/)
    assert.match(schemaText, /public_benchmark/)
    assert.match(schemaText, /public_web/)
    assert.match(schemaText, /synthetic_template/)
    assert.match(schemaText, /product_derived_rewrite/)
    assert.match(schemaText, /\[Cc\]ontamination/)
  })
})

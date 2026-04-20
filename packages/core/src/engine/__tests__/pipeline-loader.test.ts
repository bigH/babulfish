import type { PretrainedModelOptions } from "@huggingface/transformers"
import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest"
import type { PipelineOptions, TextGenerationPipeline } from "../pipeline-loader.js"

const mockPipelineFactory = vi.fn()

vi.mock("@huggingface/transformers", () => ({
  pipeline: mockPipelineFactory,
}))

import { loadPipeline } from "../pipeline-loader.js"

beforeEach(() => {
  mockPipelineFactory.mockReset()
})

describe("loadPipeline", () => {
  it("matches the transformers loader option subset", () => {
    expectTypeOf<PipelineOptions>().toEqualTypeOf<
      Readonly<Pick<PretrainedModelOptions, "dtype" | "device" | "progress_callback">>
    >()
  })

  it("delegates to transformers pipeline with model and options", async () => {
    const pipelineInstance = {} as TextGenerationPipeline
    const options: PipelineOptions = {
      dtype: "q4",
      device: "webgpu",
      progress_callback: vi.fn(),
    }
    mockPipelineFactory.mockResolvedValue(pipelineInstance)

    await expect(loadPipeline("test-model", options)).resolves.toBe(
      pipelineInstance,
    )

    expect(mockPipelineFactory).toHaveBeenCalledOnce()
    expect(mockPipelineFactory).toHaveBeenCalledWith(
      "text-generation",
      "test-model",
      options,
    )
  })

  it("delegates with no options when unspecified", async () => {
    const pipelineInstance = {} as TextGenerationPipeline
    mockPipelineFactory.mockResolvedValue(pipelineInstance)

    await expect(loadPipeline("model-no-options")).resolves.toBe(pipelineInstance)

    expect(mockPipelineFactory).toHaveBeenCalledOnce()
    expect(mockPipelineFactory).toHaveBeenCalledWith("text-generation", "model-no-options")
  })

  it("preserves load rejection from transformers", async () => {
    const cause = new Error("transformers failed")
    mockPipelineFactory.mockRejectedValue(cause)

    await expect(loadPipeline("model-fails")).rejects.toBe(cause)
  })
})

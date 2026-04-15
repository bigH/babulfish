import { beforeEach, describe, expect, it, vi } from "vitest"
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

    expect(mockPipelineFactory).toHaveBeenCalledWith(
      "text-generation",
      "test-model",
      options,
    )
  })
})

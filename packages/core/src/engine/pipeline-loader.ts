import type {
  DataType,
  Message,
  DeviceType,
  ProgressCallback,
  ProgressInfo,
  TextGenerationChatOutput,
  TextGenerationPipeline,
  TextGenerationStringOutput,
} from "@huggingface/transformers"

export type PipelineOptions = {
  readonly dtype?: DataType
  readonly device?: DeviceType
  readonly progress_callback?: ProgressCallback
}

export async function loadPipeline(
  model: string,
  opts?: PipelineOptions,
): Promise<TextGenerationPipeline> {
  const { pipeline } = await import("@huggingface/transformers")
  return pipeline("text-generation", model, opts) as Promise<TextGenerationPipeline>
}

export type {
  Message,
  ProgressInfo,
  TextGenerationChatOutput,
  TextGenerationPipeline,
  TextGenerationStringOutput,
}

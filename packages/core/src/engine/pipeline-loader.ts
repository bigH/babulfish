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

const TEXT_GENERATION_TASK = "text-generation" as const

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
  const loaded = opts === undefined
    ? await pipeline(TEXT_GENERATION_TASK, model)
    : await pipeline(TEXT_GENERATION_TASK, model, opts)
  return loaded as TextGenerationPipeline
}

export type {
  Message,
  ProgressInfo,
  TextGenerationChatOutput,
  TextGenerationPipeline,
  TextGenerationStringOutput,
}

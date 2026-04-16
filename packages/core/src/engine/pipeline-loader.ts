import type {
  PretrainedModelOptions,
  ProgressInfo,
  TextGenerationPipeline,
} from "@huggingface/transformers"

const TEXT_GENERATION_TASK = "text-generation" as const

export type PipelineOptions = Readonly<
  Pick<PretrainedModelOptions, "dtype" | "device" | "progress_callback">
>

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
  ProgressInfo,
  TextGenerationPipeline,
}

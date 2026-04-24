import type {
  PretrainedModelOptions,
  ProgressInfo,
  TextGenerationPipeline,
} from "@huggingface/transformers"

const TEXT_GENERATION_TASK = "text-generation" as const

export type PipelineOptions = Readonly<
  Pick<
    PretrainedModelOptions,
    "dtype" | "device" | "progress_callback" | "subfolder" | "model_file_name"
  >
>

export async function loadPipeline(
  model: string,
  opts?: PipelineOptions,
): Promise<TextGenerationPipeline> {
  const { pipeline } = await import("@huggingface/transformers")
  return (
    opts === undefined
      ? pipeline(TEXT_GENERATION_TASK, model)
      : pipeline(TEXT_GENERATION_TASK, model, opts)
  ) as Promise<TextGenerationPipeline>
}

export type {
  ProgressInfo,
  TextGenerationPipeline,
}

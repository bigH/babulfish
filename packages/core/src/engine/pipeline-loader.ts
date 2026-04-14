import type {
  Message,
  ProgressInfo,
  TextGenerationChatOutput,
  TextGenerationPipeline,
  TextGenerationStringOutput,
} from "@huggingface/transformers"

export type PipelineTask = "text-generation"

export type PipelineOptions = {
  readonly dtype?: string
  readonly device?: string
  readonly progress_callback?: (event: ProgressInfo) => void
}

export async function loadPipeline(
  task: PipelineTask,
  model: string,
  opts?: PipelineOptions,
): Promise<unknown> {
  const { pipeline } = await import("@huggingface/transformers")
  return pipeline(task, model, opts)
}

export type {
  Message,
  ProgressInfo,
  TextGenerationChatOutput,
  TextGenerationPipeline,
  TextGenerationStringOutput,
}

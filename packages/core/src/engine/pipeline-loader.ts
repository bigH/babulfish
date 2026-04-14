import type {
  DataType,
  DeviceType as TransformersDeviceType,
  Message,
  ProgressCallback,
  ProgressInfo,
  TextGenerationChatOutput,
  TextGenerationPipeline,
  TextGenerationStringOutput,
} from "@huggingface/transformers"

export type PipelineTask = "text-generation"

export type DeviceType = TransformersDeviceType

export type DtypeType = DataType

export type PipelineOptions = {
  readonly dtype?: DtypeType
  readonly device?: DeviceType
  readonly progress_callback?: ProgressCallback
}

export async function loadPipeline(
  task: PipelineTask,
  model: string,
  opts?: PipelineOptions,
): Promise<TextGenerationPipeline> {
  const { pipeline } = await import("@huggingface/transformers")
  return pipeline(task, model, opts) as Promise<TextGenerationPipeline>
}

export type {
  Message,
  ProgressInfo,
  TextGenerationChatOutput,
  TextGenerationPipeline,
  TextGenerationStringOutput,
}

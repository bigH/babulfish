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

export type DeviceType = TransformersDeviceType

export type DtypeType = DataType

export type PipelineOptions = {
  readonly dtype?: DtypeType
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

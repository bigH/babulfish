import type {
  Message,
  ProgressInfo,
  TextGenerationChatOutput,
  TextGenerationPipeline,
  TextGenerationStringOutput,
} from "@huggingface/transformers"

export type PipelineTask = "text-generation"

export type DeviceType =
  | "auto" | "gpu" | "cpu" | "wasm" | "webgpu"
  | "cuda" | "dml" | "coreml"
  | "webnn" | "webnn-npu" | "webnn-gpu" | "webnn-cpu"

export type DtypeType =
  | "auto" | "fp32" | "fp16"
  | "q8" | "int8" | "uint8"
  | "q4" | "bnb4" | "q4f16"

export type PipelineOptions = {
  readonly dtype?: DtypeType
  readonly device?: DeviceType
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

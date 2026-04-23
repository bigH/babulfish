export type SpikeProfileId = "webgpu-q4f16" | "wasm-q4"

export type SpikeProfile = {
  readonly id: SpikeProfileId
  readonly label: string
  readonly requestedDevice: "wasm" | "webgpu"
  readonly dtypeSelector: "q4" | "q4f16"
  readonly subfolder: "onnx"
  readonly modelFileName: "model"
  readonly expectedDownloadBytes: number
  readonly note: string
}

export type SpikeCandidateModel = {
  readonly label: string
  readonly modelId: string
  readonly defaultProfileId: SpikeProfileId
  readonly note: string
  readonly suitabilityNote?: string
  readonly profiles: readonly SpikeProfile[]
}

export type SpikePromptSpec = {
  readonly id: "sanity" | "translation"
  readonly label: string
  readonly messages: readonly {
    readonly role: "system" | "user"
    readonly content: string
  }[]
  readonly options: {
    readonly max_new_tokens: number
    readonly do_sample: false
    readonly return_full_text: false
  }
}

export type SpikeExtractionResult = {
  readonly rawText: string
  readonly parsedText: string
  readonly parsingApplied: string
}

export const SPIKE_CANDIDATE_MODELS = [
  {
    label: "Gemma 3 1B Instruct",
    modelId: "onnx-community/gemma-3-1b-it-ONNX",
    defaultProfileId: "webgpu-q4f16",
    note:
      "Standard ONNX-community layout in onnx/. This spike intentionally uses the regular transformers.js ONNX path instead of any bespoke loader wiring.",
    suitabilityNote:
      "Largest candidate of the three. Expect the heaviest browser-memory and download pressure.",
    profiles: [
      {
        id: "webgpu-q4f16",
        label: "Recommended WebGPU q4f16",
        requestedDevice: "webgpu",
        dtypeSelector: "q4f16",
        subfolder: "onnx",
        modelFileName: "model",
        expectedDownloadBytes: 763529245,
        note:
          "Assumption: transformers.js resolves onnx/model_q4f16.onnx from model_file_name=model plus dtype=q4f16. Prefer this first for in-browser viability on capable GPUs.",
      },
      {
        id: "wasm-q4",
        label: "Fallback WASM q4",
        requestedDevice: "wasm",
        dtypeSelector: "q4",
        subfolder: "onnx",
        modelFileName: "model",
        expectedDownloadBytes: 859454179,
        note:
          "CPU/WASM fallback for the same repo. Expect markedly slower generation than the WebGPU profile.",
      },
    ],
  },
  {
    label: "Qwen3 0.6B",
    modelId: "onnx-community/Qwen3-0.6B-ONNX",
    defaultProfileId: "webgpu-q4f16",
    note:
      "The repo also ships onnxruntime/webgpu and cpu_and_mobile folders, but this spike keeps to the shared transformers.js ONNX path in onnx/ for apples-to-apples browser comparison.",
    suitabilityNote:
      "Potentially the most interesting browser-fit candidate if the standard transformers.js path works cleanly.",
    profiles: [
      {
        id: "webgpu-q4f16",
        label: "Recommended WebGPU q4f16",
        requestedDevice: "webgpu",
        dtypeSelector: "q4f16",
        subfolder: "onnx",
        modelFileName: "model",
        expectedDownloadBytes: 569789750,
        note:
          "Uses the smaller standard ONNX q4f16 file, not the repo's separate ORT GenAI webgpu folder. This keeps the spike wiring simple and comparable across candidates.",
      },
      {
        id: "wasm-q4",
        label: "Fallback WASM q4",
        requestedDevice: "wasm",
        dtypeSelector: "q4",
        subfolder: "onnx",
        modelFileName: "model",
        expectedDownloadBytes: 919096585,
        note:
          "CPU/WASM fallback through the standard ONNX q4 artifact. This is larger than the WebGPU q4f16 path and may be slow.",
      },
    ],
  },
  {
    label: "Qwen2.5 0.5B Instruct",
    modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
    defaultProfileId: "webgpu-q4f16",
    note:
      "Simplest repo layout of the three: standard ONNX files only, with no extra ORT runtime subfolder requirement for this spike.",
    suitabilityNote:
      "Smallest WebGPU q4f16 artifact of the set, so it is the lowest-friction first browser smoke candidate.",
    profiles: [
      {
        id: "webgpu-q4f16",
        label: "Recommended WebGPU q4f16",
        requestedDevice: "webgpu",
        dtypeSelector: "q4f16",
        subfolder: "onnx",
        modelFileName: "model",
        expectedDownloadBytes: 483003582,
        note:
          "Likely the lightest practical WebGPU candidate in this spike. Good first check for end-to-end prompt execution.",
      },
      {
        id: "wasm-q4",
        label: "Fallback WASM q4",
        requestedDevice: "wasm",
        dtypeSelector: "q4",
        subfolder: "onnx",
        modelFileName: "model",
        expectedDownloadBytes: 786156820,
        note:
          "CPU/WASM fallback for broader machine coverage. Smaller than Gemma/Qwen3 WASM q4, but still a substantial browser download.",
      },
    ],
  },
] as const satisfies readonly SpikeCandidateModel[]

export const DEFAULT_SPIKE_MODEL = SPIKE_CANDIDATE_MODELS[0]

export const SPIKE_PROMPTS = [
  {
    id: "sanity",
    label: "Sanity prompt",
    messages: [
      {
        role: "system",
        content: "You are a concise assistant. Reply with the exact requested text and nothing else.",
      },
      {
        role: "user",
        content: "Reply with exactly: browser spike ok",
      },
    ],
    options: {
      max_new_tokens: 24,
      do_sample: false,
      return_full_text: false,
    },
  },
  {
    id: "translation",
    label: "Translation-style prompt",
    messages: [
      {
        role: "system",
        content:
          "You are a translation engine. Translate the user text to French and output only the translation.",
      },
      {
        role: "user",
        content:
          "Translate this text to French and output only the translation: The quick brown fox jumps over the lazy dog.",
      },
    ],
    options: {
      max_new_tokens: 80,
      do_sample: false,
      return_full_text: false,
    },
  },
] as const satisfies readonly SpikePromptSpec[]

export function getSpikeCandidateModel(modelId?: string | null): SpikeCandidateModel {
  return SPIKE_CANDIDATE_MODELS.find((model) => model.modelId === modelId) ?? DEFAULT_SPIKE_MODEL
}

export function getSpikeProfile(
  model: SpikeCandidateModel,
  profileId?: string | null,
): SpikeProfile {
  const resolvedProfile =
    model.profiles.find((profile) => profile.id === profileId) ??
    model.profiles.find((profile) => profile.id === model.defaultProfileId) ??
    model.profiles[0]

  if (!resolvedProfile) {
    throw new Error(`Spike model ${model.modelId} does not define any profiles`)
  }

  return resolvedProfile
}

export function formatBytes(bytes: number): string {
  const gib = bytes / 1024 ** 3
  return `${gib.toFixed(2)} GiB (${bytes.toLocaleString()} bytes)`
}

export function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return "n/a"
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`
  return `${(durationMs / 1000).toFixed(2)} s`
}

export function extractGeneratedText(output: unknown): SpikeExtractionResult {
  const generated = Array.isArray(output) ? output[0] : output

  if (
    generated &&
    typeof generated === "object" &&
    "generated_text" in generated &&
    typeof generated.generated_text === "string"
  ) {
    const rawText = generated.generated_text
    return {
      rawText,
      parsedText: rawText.trim(),
      parsingApplied: "Trimmed surrounding whitespace from generated_text.",
    }
  }

  if (
    generated &&
    typeof generated === "object" &&
    "generated_text" in generated &&
    Array.isArray(generated.generated_text)
  ) {
    const chat = generated.generated_text
    const lastMessage = [...chat].reverse().find((message) => {
      return (
        message &&
        typeof message === "object" &&
        "role" in message &&
        message.role === "assistant" &&
        "content" in message &&
        typeof message.content === "string"
      )
    })
    const parsedText =
      lastMessage && typeof lastMessage === "object" && "content" in lastMessage
        ? String(lastMessage.content).trim()
        : JSON.stringify(chat, null, 2)

    return {
      rawText: JSON.stringify(chat, null, 2),
      parsedText,
      parsingApplied:
        lastMessage === undefined
          ? "Serialized generated_text chat array because no assistant message was found."
          : "Serialized the full chat array and extracted the last assistant message content, then trimmed surrounding whitespace.",
    }
  }

  return {
    rawText: JSON.stringify(output, null, 2),
    parsedText: JSON.stringify(output, null, 2),
    parsingApplied:
      "Serialized the raw pipeline output because it did not match the expected text-generation shapes.",
  }
}

export function describeMessages(messages: SpikePromptSpec["messages"]): string {
  return messages.map((message) => `${message.role.toUpperCase()}: ${message.content}`).join("\n\n")
}

import {
  DEFAULT_SPIKE_MODEL,
  SPIKE_CANDIDATE_MODELS,
  SPIKE_PROMPTS,
  describeMessages,
  extractGeneratedText,
  formatBytes,
  formatDuration,
  getSpikeCandidateModel,
  getSpikeProfile,
  type SpikeCandidateModel,
  type SpikeProfile,
} from "./phi4-spike-helpers.js"

type TransformersModule = typeof import("@huggingface/transformers")

type SpikePipeline = Awaited<ReturnType<TransformersModule["pipeline"]>>

type PromptRunResult = {
  readonly id: string
  readonly label: string
  readonly prompt: string
  readonly generationOptions: Record<string, unknown>
  readonly success: boolean
  readonly durationMs: number
  readonly rawOutputText: string
  readonly parsedOutputText: string
  readonly parsingApplied: string
  readonly error: string | null
}

type ExperimentSnapshot = {
  readonly modelId: string
  readonly modelLabel: string
  readonly modelNote: string
  readonly suitabilityNote: string | null
  readonly profile: SpikeProfile
  readonly loadConfig: {
    readonly task: "text-generation"
    readonly device: SpikeProfile["requestedDevice"]
    readonly dtype: SpikeProfile["dtypeSelector"]
    readonly subfolder: SpikeProfile["subfolder"]
    readonly modelFileName: SpikeProfile["modelFileName"]
  }
  readonly browserSummary: string
  readonly runtimeSummary: string
  readonly loadStatus: string
  readonly generationStatus: string
  readonly latestErrors: {
    readonly load: string | null
    readonly generation: string | null
  }
  readonly loadDurationMs: number | null
  readonly generationDurationMs: number | null
  readonly promptRuns: readonly PromptRunResult[]
}

const searchParams = new URLSearchParams(window.location.search)
const AUTO_RUN = searchParams.get("spikeAuto") === "1"

function requireElement<T extends new (...args: any[]) => HTMLElement>(
  id: string,
  expectedType: T,
): InstanceType<T> {
  const el = document.getElementById(id)
  if (el === null) {
    throw new Error(`Expected #${id} to exist`)
  }
  if (!(el instanceof expectedType)) {
    throw new Error(`Expected #${id} to be a ${expectedType.name}`)
  }
  return el as InstanceType<T>
}

const modelSelect = requireElement("phi4-model", HTMLSelectElement)
const profileSelect = requireElement("phi4-profile", HTMLSelectElement)
const loadBtn = requireElement("phi4-load", HTMLButtonElement)
const runBtn = requireElement("phi4-run", HTMLButtonElement)
const disposeBtn = requireElement("phi4-dispose", HTMLButtonElement)
const modelIdOutput = requireElement("phi4-model-id", HTMLElement)
const profileOutput = requireElement("phi4-profile-summary", HTMLElement)
const browserOutput = requireElement("phi4-browser-summary", HTMLElement)
const runtimeOutput = requireElement("phi4-runtime-summary", HTMLElement)
const loadStatusOutput = requireElement("phi4-load-status", HTMLElement)
const generationStatusOutput = requireElement("phi4-generation-status", HTMLElement)
const errorOutput = requireElement("phi4-error-summary", HTMLElement)
const timingOutput = requireElement("phi4-timing-summary", HTMLElement)
const resultsOutput = requireElement("phi4-results", HTMLElement)
const logOutput = requireElement("phi4-log", HTMLElement)

let selectedModel = getSpikeCandidateModel(searchParams.get("spikeModelId"))
let selectedProfile = getSpikeProfile(selectedModel, searchParams.get("spikeProfile"))
let transformersPromise: Promise<TransformersModule> | null = null
let pipelineInstance: SpikePipeline | null = null
let pipelineSelectionKey: string | null = null
let loadStatus = "Idle"
let generationStatus = "Idle"
let loadInFlight = false
let generationInFlight = false
let loadDurationMs: number | null = null
let generationDurationMs: number | null = null
let latestLoadError: string | null = null
let latestGenerationError: string | null = null
let promptRuns: PromptRunResult[] = []
const logLines: string[] = []

function createSelectionKey(model: SpikeCandidateModel, profile: SpikeProfile): string {
  return `${model.modelId}|${profile.id}`
}

function currentSelectionKey(): string {
  return createSelectionKey(selectedModel, selectedProfile)
}

function logLine(message: string): void {
  const timestamp = new Date().toLocaleTimeString()
  logLines.unshift(`[${timestamp}] ${message}`)
  logOutput.textContent = logLines.slice(0, 40).join("\n")
}

function browserSummary(): string {
  const gpuAvailable = typeof navigator !== "undefined" && "gpu" in navigator
  return [
    `crossOriginIsolated=${String(window.crossOriginIsolated)}`,
    `navigator.gpu=${gpuAvailable ? "yes" : "no"}`,
    `userAgent=${navigator.userAgent}`,
  ].join(" | ")
}

function inferRuntimeSummary(): string {
  const modelSession = (pipelineInstance as any)?.model?.sessions?.model
  const sessionConfig = modelSession?.config
  const sessionProviders = modelSession?.executionProviders ?? modelSession?.options?.executionProviders

  const parts = [
    `requested.device=${selectedProfile.requestedDevice}`,
    `requested.dtype=${selectedProfile.dtypeSelector}`,
    `session.config.device=${sessionConfig?.device ?? "unknown"}`,
    `session.config.dtype=${sessionConfig?.dtype ?? "unknown"}`,
  ]

  if (sessionProviders !== undefined) {
    parts.push(`executionProviders=${JSON.stringify(sessionProviders)}`)
  }

  return parts.join(" | ")
}

function syncSpikeUrlSelection(): void {
  const params = new URLSearchParams(window.location.search)
  params.delete("spikeModelId")
  params.delete("spikeProfile")

  if (selectedModel.modelId !== DEFAULT_SPIKE_MODEL.modelId) {
    params.set("spikeModelId", selectedModel.modelId)
  }
  if (selectedProfile.id !== selectedModel.defaultProfileId) {
    params.set("spikeProfile", selectedProfile.id)
  }

  const nextSearch = params.toString()
  const nextUrl =
    `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`
  window.history.replaceState(null, "", nextUrl)
}

function render(): void {
  modelIdOutput.textContent = selectedModel.modelId
  profileOutput.textContent = [
    `${selectedModel.label}`,
    `profile=${selectedProfile.id}`,
    `device=${selectedProfile.requestedDevice}`,
    `dtype=${selectedProfile.dtypeSelector}`,
    `subfolder=${selectedProfile.subfolder}`,
    `model_file_name=${selectedProfile.modelFileName}`,
    `expected download≈${formatBytes(selectedProfile.expectedDownloadBytes)}`,
  ].join(" | ")
  browserOutput.textContent = browserSummary()
  runtimeOutput.textContent = inferRuntimeSummary()
  loadStatusOutput.textContent = loadStatus
  generationStatusOutput.textContent = generationStatus
  errorOutput.textContent = [latestLoadError, latestGenerationError].filter(Boolean).join(" | ") || "None"
  timingOutput.textContent = [
    `load=${formatDuration(loadDurationMs)}`,
    `generation=${formatDuration(generationDurationMs)}`,
  ].join(" | ")

  const snapshot: ExperimentSnapshot = {
    modelId: selectedModel.modelId,
    modelLabel: selectedModel.label,
    modelNote: selectedModel.note,
    suitabilityNote: selectedModel.suitabilityNote ?? null,
    profile: selectedProfile,
    loadConfig: {
      task: "text-generation",
      device: selectedProfile.requestedDevice,
      dtype: selectedProfile.dtypeSelector,
      subfolder: selectedProfile.subfolder,
      modelFileName: selectedProfile.modelFileName,
    },
    browserSummary: browserSummary(),
    runtimeSummary: inferRuntimeSummary(),
    loadStatus,
    generationStatus,
    latestErrors: {
      load: latestLoadError,
      generation: latestGenerationError,
    },
    loadDurationMs,
    generationDurationMs,
    promptRuns,
  }

  resultsOutput.textContent = JSON.stringify(snapshot, null, 2)

  const busy = loadInFlight || generationInFlight
  modelSelect.disabled = busy
  profileSelect.disabled = busy
  loadBtn.disabled = busy
  runBtn.disabled = busy
  disposeBtn.disabled = busy
}

function populateModels(): void {
  for (const candidate of SPIKE_CANDIDATE_MODELS) {
    const option = document.createElement("option")
    option.value = candidate.modelId
    option.textContent = `${candidate.label} — ${candidate.modelId}`
    modelSelect.appendChild(option)
  }
  modelSelect.value = selectedModel.modelId
}

function populateProfiles(): void {
  profileSelect.textContent = ""

  for (const profile of selectedModel.profiles) {
    const option = document.createElement("option")
    option.value = profile.id
    option.textContent = profile.label
    profileSelect.appendChild(option)
  }

  profileSelect.value = selectedProfile.id
}

async function getTransformersModule(): Promise<TransformersModule> {
  transformersPromise ??= import("@huggingface/transformers")
  return await transformersPromise
}

async function disposePipeline(): Promise<void> {
  if (pipelineInstance && typeof (pipelineInstance as any).dispose === "function") {
    await (pipelineInstance as any).dispose()
  }
  pipelineInstance = null
  pipelineSelectionKey = null
  loadStatus = "Idle"
  generationStatus = "Idle"
  loadInFlight = false
  generationInFlight = false
  loadDurationMs = null
  generationDurationMs = null
  latestLoadError = null
  latestGenerationError = null
  promptRuns = []
  logLine("Disposed browser-spike pipeline and cleared captured outputs.")
  render()
}

async function ensurePipeline(): Promise<SpikePipeline> {
  const selectionKey = currentSelectionKey()
  if (pipelineInstance && pipelineSelectionKey === selectionKey) {
    return pipelineInstance
  }

  if (pipelineInstance && pipelineSelectionKey !== selectionKey) {
    await disposePipeline()
  }

  const transformers = await getTransformersModule()
  const { pipeline, env, LogLevel } = transformers

  env.logLevel = LogLevel.INFO

  loadInFlight = true
  loadStatus = `Loading… ${selectedModel.label} / ${selectedProfile.label}`
  loadDurationMs = null
  latestLoadError = null
  latestGenerationError = null
  generationStatus = "Idle"
  promptRuns = []
  render()

  logLine(
    `Loading ${selectedModel.modelId} with device=${selectedProfile.requestedDevice}, dtype=${selectedProfile.dtypeSelector}, subfolder=${selectedProfile.subfolder}, navigator.gpu=${String("gpu" in navigator)}.`,
  )
  logLine(selectedModel.note)
  if (selectedModel.suitabilityNote) {
    logLine(selectedModel.suitabilityNote)
  }
  logLine(selectedProfile.note)

  const startedAt = performance.now()

  try {
    pipelineInstance = await pipeline("text-generation", selectedModel.modelId, {
      device: selectedProfile.requestedDevice,
      dtype: selectedProfile.dtypeSelector,
      model_file_name: selectedProfile.modelFileName,
      subfolder: selectedProfile.subfolder,
      progress_callback(progress) {
        if (!loadInFlight) {
          return
        }

        const file = "file" in progress ? String(progress.file) : "unknown-file"
        const status = "status" in progress ? String(progress.status) : "progress"
        const loaded = "loaded" in progress && typeof progress.loaded === "number" ? progress.loaded : null
        const total = "total" in progress && typeof progress.total === "number" ? progress.total : null
        const percent =
          loaded !== null && total && total > 0
            ? ` (${Math.round((loaded / total) * 100)}%)`
            : ""
        loadStatus = `Loading… ${status}${percent}`
        render()
        logLine(`${status}: ${file}${percent}`)
      },
    }) as SpikePipeline

    pipelineSelectionKey = selectionKey
    loadInFlight = false
    loadDurationMs = performance.now() - startedAt
    loadStatus = `Succeeded (${selectedModel.label} / ${selectedProfile.label})`
    logLine(`Load succeeded in ${formatDuration(loadDurationMs)}.`)
    render()
    return pipelineInstance
  } catch (error) {
    pipelineInstance = null
    pipelineSelectionKey = null
    loadInFlight = false
    loadDurationMs = performance.now() - startedAt
    latestLoadError = formatError(error)
    loadStatus = `Failed: ${latestLoadError}`
    logLine(`Load failed after ${formatDuration(loadDurationMs)}: ${latestLoadError}`)
    render()
    throw error
  }
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.stack ?? error.message
  return String(error)
}

async function runPromptSequence(): Promise<void> {
  generationInFlight = true
  generationStatus = "Running…"
  generationDurationMs = null
  latestGenerationError = null
  promptRuns = []
  render()

  let generationStartedAt: number | null = null
  const nextRuns: PromptRunResult[] = []

  try {
    const pipe = await ensurePipeline()
    generationStartedAt = performance.now()

    for (const prompt of SPIKE_PROMPTS) {
      const promptStartedAt = performance.now()
      logLine(`Running ${prompt.label}.`)

      try {
        const rawOutput = await (pipe as any)(prompt.messages, prompt.options)
        const extracted = extractGeneratedText(rawOutput)
        const durationMs = performance.now() - promptStartedAt
        nextRuns.push({
          id: prompt.id,
          label: prompt.label,
          prompt: describeMessages(prompt.messages),
          generationOptions: { ...prompt.options },
          success: true,
          durationMs,
          rawOutputText: extracted.rawText,
          parsedOutputText: extracted.parsedText,
          parsingApplied: extracted.parsingApplied,
          error: null,
        })
        logLine(`${prompt.label} succeeded in ${formatDuration(durationMs)}.`)
      } catch (error) {
        const durationMs = performance.now() - promptStartedAt
        const formattedError = formatError(error)
        nextRuns.push({
          id: prompt.id,
          label: prompt.label,
          prompt: describeMessages(prompt.messages),
          generationOptions: { ...prompt.options },
          success: false,
          durationMs,
          rawOutputText: "",
          parsedOutputText: "",
          parsingApplied: "No parsing applied because generation threw before returning output.",
          error: formattedError,
        })
        latestGenerationError = formattedError
        logLine(`${prompt.label} failed in ${formatDuration(durationMs)}: ${formattedError}`)
        throw error
      } finally {
        promptRuns = [...nextRuns]
        render()
      }
    }

    generationDurationMs = performance.now() - generationStartedAt
    generationStatus = "Succeeded"
    logLine(`All canned prompts completed in ${formatDuration(generationDurationMs)}.`)
    render()
  } catch (error) {
    generationDurationMs =
      generationStartedAt === null ? null : performance.now() - generationStartedAt
    latestGenerationError ??= formatError(error)
    generationStatus = `Failed: ${latestGenerationError}`
    render()
  } finally {
    generationInFlight = false
    render()
  }
}

async function updateSelection(
  nextModel: SpikeCandidateModel,
  nextProfile: SpikeProfile,
  reason: string,
): Promise<void> {
  selectedModel = nextModel
  selectedProfile = nextProfile
  modelSelect.value = selectedModel.modelId
  populateProfiles()
  syncSpikeUrlSelection()
  logLine(reason)

  if (pipelineSelectionKey && pipelineSelectionKey !== currentSelectionKey()) {
    await disposePipeline()
  }

  render()
}

populateModels()
populateProfiles()
syncSpikeUrlSelection()
render()
logLine(
  "Browser model spike initialized. This section is a private experiment and does not change babulfish package APIs.",
)

modelSelect.addEventListener("change", () => {
  const nextModel = getSpikeCandidateModel(modelSelect.value)
  const nextProfile = getSpikeProfile(nextModel, selectedProfile.id)
  void updateSelection(
    nextModel,
    nextProfile,
    `Selected candidate model: ${nextModel.label} (${nextModel.modelId}).`,
  ).catch(() => {})
})

profileSelect.addEventListener("change", () => {
  const nextProfile = getSpikeProfile(selectedModel, profileSelect.value)
  void updateSelection(
    selectedModel,
    nextProfile,
    `Selected spike profile: ${nextProfile.label} for ${selectedModel.label}.`,
  ).catch(() => {})
})

loadBtn.addEventListener("click", () => {
  void ensurePipeline().catch(() => {})
})

runBtn.addEventListener("click", () => {
  void runPromptSequence().catch(() => {})
})

disposeBtn.addEventListener("click", () => {
  void disposePipeline().catch(() => {})
})

window.addEventListener("beforeunload", () => {
  void disposePipeline().catch(() => {})
})

if (AUTO_RUN) {
  logLine("Auto-run enabled from ?spikeAuto=1.")
  void runPromptSequence().catch(() => {})
}

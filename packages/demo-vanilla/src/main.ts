import { createBabulfish, type ModelDType, type Snapshot } from "@babulfish/core"
import "@babulfish/styles/css"

const STRUCTURED_SOURCE = [
  "Structured text keeps inline emphasis, links, and line breaks",
  "while code stays opaque.",
].join("\n")
const STRUCTURED_DOM_SUFFIX = " [dom-structured]"
const DEMO_ROOTS = [
  { label: "copy", selector: "[data-demo-copy]" },
  { label: "aside", selector: "[data-demo-aside]" },
] as const

const searchParams = new URLSearchParams(window.location.search)

function resolveRequestedDevice(): "auto" | "wasm" | "webgpu" {
  const requestedDevice = searchParams.get("device")
  return requestedDevice === "wasm" || requestedDevice === "webgpu" ? requestedDevice : "auto"
}

function resolveRequestedModelId(): string | undefined {
  const modelId = searchParams.get("modelId")?.trim()
  return modelId ? modelId : undefined
}

function resolveRequestedDType(): ModelDType | undefined {
  const dtype = searchParams.get("dtype")
  return dtype === "q4" || dtype === "q8" || dtype === "fp16" || dtype === "fp32"
    ? dtype
    : undefined
}

function shouldAutoloadModel(): boolean {
  return searchParams.get("autoload") === "1"
}

const requestedDevice = resolveRequestedDevice()
const requestedModelId = resolveRequestedModelId()
const requestedDType = resolveRequestedDType()
const autoloadModel = shouldAutoloadModel()

const core = createBabulfish({
  engine: {
    device: requestedDevice,
    ...(requestedModelId ? { modelId: requestedModelId } : {}),
    ...(requestedDType ? { dtype: requestedDType } : {}),
  },
  dom: {
    roots: DEMO_ROOTS.map(({ selector }) => selector),
    structuredText: { selector: "[data-structured]" },
    preserve: {
      matchers: ["babulfish", "TranslateGemma", "WebGPU"],
    },
    shouldSkip: (text, defaultSkip) => defaultSkip(text) || text.startsWith("SKU-"),
    outputTransform: (translated, context) => (
      context.kind === "structuredText"
        ? `${translated}${STRUCTURED_DOM_SUFFIX}`
        : translated
    ),
  },
})

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

function requireRoot(selector: string): HTMLElement {
  const root = document.querySelector<HTMLElement>(selector)
  if (root === null) {
    throw new Error(`Expected demo root ${selector} to exist`)
  }
  return root
}

function toPercent(progress: number): string {
  return `${Math.round(progress * 100)}%`
}

const translatedRoots = DEMO_ROOTS.map(({ label, selector }) => ({
  label,
  root: requireRoot(selector),
}))

function formatDirections(): string {
  return translatedRoots
    .map(({ label, root }) => `${label}: ${root.getAttribute("dir") ?? "none"}`)
    .join(" / ")
}

function modelStatusText(model: Snapshot["model"]): string {
  switch (model.status) {
    case "idle":
      return "Not loaded"
    case "downloading":
      return `Downloading (${toPercent(model.progress)})`
    case "ready":
      return "Ready"
    case "error":
      return "Error"
  }
}

function translationStatusText(translation: Snapshot["translation"]): string {
  switch (translation.status) {
    case "idle":
      return "Idle"
    case "translating":
      return `Translating (${toPercent(translation.progress)})`
  }
}

function capabilitiesText(snapshot: Snapshot): string {
  const { capabilities } = snapshot
  if (!capabilities.ready) {
    return "Neutral SSR/client bootstrap state"
  }

  const memoryText =
    capabilities.approxDeviceMemoryGiB === null
      ? "memory: unknown"
      : `memory: ~${capabilities.approxDeviceMemoryGiB} GiB`

  return [
    capabilities.hasWebGPU ? "webgpu: yes" : "webgpu: no",
    capabilities.isMobile ? "mobile: yes" : "mobile: no",
    memoryText,
    capabilities.crossOriginIsolated ? "coi: yes" : "coi: no",
  ].join(" / ")
}

function enablementText(snapshot: Snapshot): string {
  const { enablement } = snapshot
  return [enablement.status, enablement.verdict.outcome].join(" / ")
}

const select = requireElement("language", HTMLSelectElement)
const restoreBtn = requireElement("restore", HTMLButtonElement)
const loadBtn = requireElement("load-model", HTMLButtonElement)
const statusRequestedDevice = requireElement("status-requested-device", HTMLElement)
const statusRequestedModel = requireElement("status-requested-model", HTMLElement)
const statusRequestedDType = requireElement("status-requested-dtype", HTMLElement)
const statusCapabilities = requireElement("status-capabilities", HTMLElement)
const statusEnablement = requireElement("status-enablement", HTMLElement)
const statusVerdict = requireElement("status-verdict", HTMLElement)
const statusRuntime = requireElement("status-runtime", HTMLElement)
const statusModel = requireElement("status-model", HTMLElement)
const statusTranslation = requireElement("status-translation", HTMLElement)
const statusLanguage = requireElement("status-language", HTMLElement)
const statusDirection = requireElement("status-direction", HTMLElement)
const translateTextBtn = requireElement("translate-text", HTMLButtonElement)
const statusRawText = requireElement("status-raw-text", HTMLOutputElement)

for (const lang of core.languages) {
  const opt = document.createElement("option")
  opt.value = lang.code
  opt.textContent = lang.label
  select.appendChild(opt)
}

function resetRawTextProof(): void {
  statusRawText.textContent = "Not run"
}

function render(s: Snapshot): void {
  statusRequestedDevice.textContent = requestedDevice
  statusRequestedModel.textContent = requestedModelId ?? "default"
  statusRequestedDType.textContent = requestedDType ?? "default"
  statusCapabilities.textContent = capabilitiesText(s)
  statusEnablement.textContent = enablementText(s)
  statusVerdict.textContent = s.enablement.verdict.reason
  statusRuntime.textContent = s.enablement.verdict.resolvedDevice ?? "none"
  statusModel.textContent = modelStatusText(s.model)
  statusTranslation.textContent = translationStatusText(s.translation)
  statusLanguage.textContent = s.currentLanguage ?? "Original"
  statusDirection.textContent = formatDirections()
  select.value = s.currentLanguage ?? ""

  const modelReady = s.model.status === "ready"
  const translating = s.translation.status === "translating"

  select.disabled = !modelReady || translating
  restoreBtn.disabled = !modelReady || s.currentLanguage === null
  loadBtn.disabled = s.model.status !== "idle"
  translateTextBtn.disabled = !modelReady || translating || (s.currentLanguage ?? "") === ""
}

render(core.snapshot)
core.subscribe(render)

loadBtn.addEventListener("click", () => {
  void core.loadModel().catch(() => {})
})

if (autoloadModel) {
  void core.loadModel().catch(() => {})
}

select.addEventListener("change", () => {
  const code = select.value
  resetRawTextProof()
  if (!code) {
    core.restore()
    return
  }

  void core.translateTo(code)
})

restoreBtn.addEventListener("click", () => {
  core.restore()
  resetRawTextProof()
})

translateTextBtn.addEventListener("click", async () => {
  const targetLang = core.snapshot.currentLanguage
  if (!targetLang) return

  statusRawText.textContent = "Running raw translateText()..."
  const translated = await core.translateText(STRUCTURED_SOURCE, targetLang)
  statusRawText.textContent = translated
})

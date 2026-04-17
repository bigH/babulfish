import type { BabulfishCore, Snapshot } from "@babulfish/core"
import "@babulfish/styles/css"

import {
  getDTypeLabel,
  getDeviceLabel,
  mergeDemoRuntimeSelection,
  mergeDemoRuntimeSearchParams,
  DEMO_MODEL_PRESETS,
  DEVICE_OPTIONS,
  DTYPE_OPTIONS,
  type DemoRuntimeSelection,
  type ResolvedDemoRuntimeSelection,
} from "../../demo-shared/src/runtime-selection.js"
import { enablementText } from "./enablement-text.js"
import {
  bootstrapVanillaDemoRuntime,
  createVanillaDemoCore,
  DEMO_ROOTS,
  STRUCTURED_SOURCE,
} from "./runtime-demo.js"

const searchParams = new URLSearchParams(window.location.search)

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
      ? "Memory unknown"
      : `~${capabilities.approxDeviceMemoryGiB} GiB`

  return [
    capabilities.hasWebGPU ? "WebGPU yes" : "WebGPU no",
    capabilities.isMobile ? "Mobile yes" : "Mobile no",
    memoryText,
    capabilities.crossOriginIsolated ? "COI yes" : "COI no",
  ].join(" / ")
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

function formatRequestedDevice(requested: string | null, fallback: DemoRuntimeSelection["device"]): string {
  if (!requested) {
    return getDeviceLabel(fallback)
  }

  return requested === "auto" || requested === "wasm" || requested === "webgpu"
    ? getDeviceLabel(requested)
    : requested
}

function formatRequestedDType(requested: string | null, fallback: DemoRuntimeSelection["dtype"]): string {
  if (!requested) {
    return getDTypeLabel(fallback)
  }

  return requested === "q4" || requested === "q8" || requested === "fp16" || requested === "fp32"
    ? getDTypeLabel(requested)
    : requested
}

function formatRequestedModel(modelId: string | null, fallbackModelId: string): string {
  if (!modelId) {
    return fallbackModelId
  }

  return modelId
}

const runtimeDevice = requireElement("runtime-device", HTMLSelectElement)
const runtimeModel = requireElement("runtime-model", HTMLSelectElement)
const runtimeDType = requireElement("runtime-dtype", HTMLSelectElement)
const runtimeAutoload = requireElement("runtime-autoload", HTMLInputElement)
const runtimePreset = requireElement("runtime-preset", HTMLElement)
const runtimeMessage = requireElement("runtime-message", HTMLElement)
const runtimeConstraints = requireElement("runtime-constraints", HTMLElement)
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

const initialDemoRuntime = bootstrapVanillaDemoRuntime(searchParams)

let runtimeState = initialDemoRuntime.runtimeState
let core = initialDemoRuntime.core
let unsubscribe = core.subscribe(render)

for (const option of DEVICE_OPTIONS) {
  const el = document.createElement("option")
  el.value = option.value
  el.textContent = option.label
  runtimeDevice.appendChild(el)
}

for (const preset of DEMO_MODEL_PRESETS) {
  const el = document.createElement("option")
  el.value = preset.modelId
  el.textContent = preset.modelId
  runtimeModel.appendChild(el)
}

for (const option of DTYPE_OPTIONS) {
  const el = document.createElement("option")
  el.value = option.value
  el.textContent = option.label
  runtimeDType.appendChild(el)
}

for (const lang of core.languages) {
  const opt = document.createElement("option")
  opt.value = lang.code
  opt.textContent = lang.label
  select.appendChild(opt)
}

function updateRuntimeMessage(): void {
  runtimePreset.textContent = runtimeState.preset.label

  const repairText = runtimeState.repairs.map((repair) => repair.message).join(" ")
  runtimeMessage.textContent =
    repairText || runtimeState.preset.note || runtimeState.preset.description
  runtimeConstraints.textContent = [
    `Allowed quantization: ${runtimeState.preset.allowedDTypes.map(getDTypeLabel).join(" / ")}.`,
    `Allowed devices: ${runtimeState.preset.allowedDevices.map(getDeviceLabel).join(" / ")}.`,
  ].join(" ")
}

function setRuntimeControlsDisabled(disabled: boolean): void {
  runtimeDevice.disabled = disabled
  runtimeModel.disabled = disabled
  runtimeDType.disabled = disabled
  runtimeAutoload.disabled = disabled
}

function formatResolvedRuntime(snapshot: Snapshot): string {
  const { verdict } = snapshot.enablement
  const resolvedDevice =
    verdict.outcome === "denied"
      ? "Denied"
      : verdict.resolvedDevice === null
        ? "Pending"
        : getDeviceLabel(verdict.resolvedDevice)

  return [
    resolvedDevice,
    runtimeState.selection.modelId,
    getDTypeLabel(runtimeState.selection.dtype),
  ].join(" / ")
}

function updateRuntimeControls(): void {
  const { preset, selection } = runtimeState

  runtimeDevice.value = selection.device
  runtimeModel.value = selection.modelId
  runtimeDType.value = selection.dtype
  runtimeAutoload.checked = runtimeState.autoload

  for (const option of Array.from(runtimeDevice.options)) {
    const value = option.value as DemoRuntimeSelection["device"]
    const allowed = preset.allowedDevices.includes(value)
    option.disabled = !allowed
    option.textContent = allowed
      ? getDeviceLabel(value)
      : `${getDeviceLabel(value)} (not verified for this preset)`
  }

  for (const option of Array.from(runtimeDType.options)) {
    const value = option.value as DemoRuntimeSelection["dtype"]
    const allowed = preset.allowedDTypes.includes(value)
    option.disabled = !allowed
    option.textContent = allowed
      ? getDTypeLabel(value)
      : `${getDTypeLabel(value)} (not verified for this preset)`
  }

  updateRuntimeMessage()
}

function syncUrl(): void {
  const params = mergeDemoRuntimeSearchParams(
    new URLSearchParams(window.location.search),
    runtimeState,
  )
  const nextSearch = params.toString()
  const nextUrl =
    `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`
  window.history.replaceState(null, "", nextUrl)
}

function resetRawTextProof(): void {
  statusRawText.textContent = "Not run"
}

function render(snapshot: Snapshot): void {
  statusRequestedDevice.textContent = formatRequestedDevice(
    runtimeState.requested.device,
    runtimeState.preset.defaultDevice,
  )
  statusRequestedModel.textContent = formatRequestedModel(
    runtimeState.requested.modelId,
    runtimeState.preset.modelId,
  )
  statusRequestedDType.textContent = formatRequestedDType(
    runtimeState.requested.dtype,
    runtimeState.preset.defaultDType,
  )
  statusCapabilities.textContent = capabilitiesText(snapshot)
  statusEnablement.textContent = enablementText(snapshot)
  statusVerdict.textContent = snapshot.enablement.verdict.reason
  statusRuntime.textContent = formatResolvedRuntime(snapshot)
  statusModel.textContent = modelStatusText(snapshot.model)
  statusTranslation.textContent = translationStatusText(snapshot.translation)
  statusLanguage.textContent = snapshot.currentLanguage ?? "Original"
  statusDirection.textContent = formatDirections()
  select.value = snapshot.currentLanguage ?? ""

  const modelReady = snapshot.model.status === "ready"
  const translating = snapshot.translation.status === "translating"
  const runtimeBusy = snapshot.model.status === "downloading" || translating

  setRuntimeControlsDisabled(runtimeBusy)
  select.disabled = !modelReady || translating
  restoreBtn.disabled = !modelReady || snapshot.currentLanguage === null
  loadBtn.disabled = snapshot.model.status !== "idle"
  translateTextBtn.disabled =
    !modelReady || translating || (snapshot.currentLanguage ?? "") === ""
}

function attachCore(nextRuntimeState: ResolvedDemoRuntimeSelection): void {
  unsubscribe()
  core.abort()
  core.restore()
  void core.dispose().catch(() => {})

  runtimeState = nextRuntimeState
  syncUrl()
  updateRuntimeControls()
  resetRawTextProof()

  core = createVanillaDemoCore(runtimeState.selection)
  unsubscribe = core.subscribe(render)
  render(core.snapshot)

  if (runtimeState.autoload) {
    void core.loadModel().catch(() => {})
  }
}

function updateRuntimeSelection(
  patch: Partial<DemoRuntimeSelection>,
): void {
  attachCore(mergeDemoRuntimeSelection(runtimeState, patch))
}

function updateAutoloadMode(autoload: boolean): void {
  runtimeState = mergeDemoRuntimeSelection(runtimeState, { autoload })
  syncUrl()
  updateRuntimeControls()
  render(core.snapshot)

  if (autoload && core.snapshot.model.status === "idle") {
    void core.loadModel().catch(() => {})
  }
}

updateRuntimeControls()
render(core.snapshot)
syncUrl()

loadBtn.addEventListener("click", () => {
  void core.loadModel().catch(() => {})
})

runtimeDevice.addEventListener("change", () => {
  updateRuntimeSelection({
    device: runtimeDevice.value as DemoRuntimeSelection["device"],
  })
})

runtimeModel.addEventListener("change", () => {
  updateRuntimeSelection({
    modelId: runtimeModel.value,
  })
})

runtimeDType.addEventListener("change", () => {
  updateRuntimeSelection({
    dtype: runtimeDType.value as DemoRuntimeSelection["dtype"],
  })
})

runtimeAutoload.addEventListener("change", () => {
  updateAutoloadMode(runtimeAutoload.checked)
})

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

if (runtimeState.autoload) {
  void core.loadModel().catch(() => {})
}

import type { Snapshot } from "@babulfish/core"
import "@babulfish/styles/css"

import {
  DEMO_MODEL_SPECS,
  DEVICE_OPTIONS,
  DTYPE_OPTIONS,
  getDTypeLabel,
  getDeviceLabel,
  mergeDemoRuntimeSelection,
  mergeDemoRuntimeSearchParams,
  resolveDemoRuntimeSelectionFromSearchParams,
  type DemoRuntimeSelection,
  type DemoRuntimeSelectionPatch,
  type ResolvedDemoRuntimeSelection,
} from "../../demo-shared/src/runtime-selection.js"
import { enablementText } from "./enablement-text.js"
import {
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

function appendOption(
  select: HTMLSelectElement,
  value: string,
  label: string,
): void {
  const option = document.createElement("option")
  option.value = value
  option.textContent = label
  select.appendChild(option)
}

function updateConstrainedOptions<T extends string>(
  select: HTMLSelectElement,
  allowedValues: readonly T[],
  getLabel: (value: T) => string,
): void {
  for (const option of Array.from(select.options)) {
    const value = option.value as T
    const allowed = allowedValues.includes(value)
    option.disabled = !allowed
    option.textContent = allowed
      ? getLabel(value)
      : `${getLabel(value)} (not verified for this model)`
  }
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
const statusEffectiveDevice = requireElement("status-effective-device", HTMLElement)
const statusResolvedDevice = requireElement("status-resolved-device", HTMLElement)
const statusEffectiveDType = requireElement("status-effective-dtype", HTMLElement)
const statusResolvedModel = requireElement("status-resolved-model", HTMLElement)
const statusAdapter = requireElement("status-adapter", HTMLElement)
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

let runtimeState = resolveDemoRuntimeSelectionFromSearchParams(searchParams)
let core = createVanillaDemoCore(runtimeState.selection)
let unsubscribe = core.subscribe(render)

for (const option of DEVICE_OPTIONS) {
  appendOption(runtimeDevice, option.value, option.label)
}

for (const model of DEMO_MODEL_SPECS) {
  appendOption(
    runtimeModel,
    model.id,
    `${model.label} (${model.id}, adapter ${model.adapterId})`,
  )
}

for (const option of DTYPE_OPTIONS) {
  appendOption(runtimeDType, option.value, option.label)
}

for (const lang of core.languages) {
  appendOption(select, lang.code, lang.label)
}

function updateRuntimeMessage(): void {
  runtimePreset.textContent = `${runtimeState.model.label} (${runtimeState.model.id})`

  const repairText = runtimeState.repairs.map((repair) => repair.message).join(" ")
  runtimeMessage.textContent =
    repairText || runtimeState.model.note || runtimeState.model.description
  runtimeConstraints.textContent = [
    `Adapter: ${runtimeState.model.adapterId}.`,
    `Resolved model: ${runtimeState.model.resolvedModelId}.`,
    `Allowed quantization: ${runtimeState.model.allowedDTypes.map(getDTypeLabel).join(" / ")}.`,
    `Allowed devices: ${runtimeState.model.allowedDevices.map(getDeviceLabel).join(" / ")}.`,
  ].join(" ")
}

function setRuntimeControlsDisabled(disabled: boolean): void {
  runtimeDevice.disabled = disabled
  runtimeModel.disabled = disabled
  runtimeDType.disabled = disabled
  runtimeAutoload.disabled = disabled
}

function formatResolvedRuntime(snapshot: Snapshot): string {
  const devicePath = [
    `requested ${formatRequestedDevice()}`,
    `effective ${getDeviceLabel(runtimeState.selection.device)}`,
    `resolved ${formatResolvedDevice(snapshot)}`,
  ].join(" -> ")

  return [
    `device ${devicePath}`,
    `model ${runtimeState.selection.model.id} -> ${runtimeState.selection.model.resolvedModelId}`,
    `adapter ${runtimeState.selection.model.adapterId}`,
    `dtype ${getDTypeLabel(runtimeState.selection.dtype)}`,
  ].join(" / ")
}

function formatRequestedDevice(): string {
  const requestedDevice = runtimeState.requested.device ?? runtimeState.model.defaultDevice
  return getDeviceLabel(requestedDevice as DemoRuntimeSelection["device"])
}

function formatResolvedDevice(snapshot: Snapshot): string {
  const { verdict } = snapshot.enablement
  if (verdict.outcome === "denied") return "Denied"
  if (verdict.resolvedDevice === null) return "Pending"
  return getDeviceLabel(verdict.resolvedDevice)
}

function formatRequestedDType(): string {
  const requestedDType = runtimeState.requested.dtype ?? runtimeState.model.defaultDType
  return getDTypeLabel(requestedDType as DemoRuntimeSelection["dtype"])
}

function updateRuntimeControls(): void {
  const { model, selection } = runtimeState

  runtimeDevice.value = selection.device
  runtimeModel.value = selection.model.id
  runtimeDType.value = selection.dtype
  runtimeAutoload.checked = runtimeState.autoload

  updateConstrainedOptions(runtimeDevice, model.allowedDevices, getDeviceLabel)
  updateConstrainedOptions(runtimeDType, model.allowedDTypes, getDTypeLabel)

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
  statusRequestedDevice.textContent = formatRequestedDevice()
  statusRequestedModel.textContent =
    runtimeState.requested.model ?? runtimeState.selection.model.id
  statusRequestedDType.textContent = formatRequestedDType()
  statusEffectiveDevice.textContent = getDeviceLabel(runtimeState.selection.device)
  statusResolvedDevice.textContent = formatResolvedDevice(snapshot)
  statusEffectiveDType.textContent = getDTypeLabel(runtimeState.selection.dtype)
  statusResolvedModel.textContent = runtimeState.selection.model.resolvedModelId
  statusAdapter.textContent = runtimeState.selection.model.adapterId
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

function updateRuntimeSelection(patch: DemoRuntimeSelectionPatch): void {
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
    model: runtimeModel.value,
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

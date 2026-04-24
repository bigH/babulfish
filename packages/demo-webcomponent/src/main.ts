import "./babulfish-translator.js"
import type { Snapshot } from "@babulfish/core"

import {
  appendStatusEntry,
  formatRequestedModelIdentity,
  formatRequestedDType,
  formatRequestedDevice,
  observeHostDocument,
  requireButton,
  requireEventLog,
  requireHostControls,
  requireSelect,
  requireStatus,
  restoreTranslators,
  setTranslatorLanguage,
  syncTranslatorRuntimeAttrs,
  type TranslatorHostElement,
} from "./main-helpers.js"
import {
  createDemoRuntimeSelectionKey,
  mergeDemoRuntimeSearchParams,
  DEMO_MODEL_PRESETS,
  DEVICE_OPTIONS,
  DTYPE_OPTIONS,
  getDTypeLabel,
  getDeviceLabel,
  mergeDemoRuntimeSelection,
  resolveDemoRuntimeSelectionFromSearchParams,
  type DemoRuntimeSelection,
  type ResolvedDemoRuntimeSelection,
} from "../../demo-shared/src/runtime-selection.js"

function readRuntimeState(): ResolvedDemoRuntimeSelection {
  return resolveDemoRuntimeSelectionFromSearchParams(
    new URLSearchParams(window.location.search),
  )
}

const eventLog = requireEventLog(document)
const translators = Array.from(
  document.querySelectorAll("babulfish-translator"),
) as TranslatorHostElement[]
const hostControls = requireHostControls(document)
const runtimeDevice = requireSelect(document, "runtime-device")
const runtimeModel = requireSelect(document, "runtime-model")
const runtimeDType = requireSelect(document, "runtime-dtype")
const runtimeMessage = requireStatus(document, "runtime-message")
const runtimeStatus = requireStatus(document, "runtime-status")
const translateSpanishButton = requireButton(document, "host-translate-es")
const translateArabicButton = requireButton(document, "host-translate-ar")
const restoreButton = requireButton(document, "host-restore")

let runtimeState = readRuntimeState()
let runtimeKey = createDemoRuntimeSelectionKey(runtimeState.selection)
const latestSnapshots = new Map<number, Snapshot>()

for (const option of DEVICE_OPTIONS) {
  const el = document.createElement("option")
  el.value = option.value
  el.textContent = option.label
  runtimeDevice.appendChild(el)
}

for (const preset of DEMO_MODEL_PRESETS) {
  const el = document.createElement("option")
  el.value = preset.id
  el.textContent = `${preset.label} (${preset.id})`
  runtimeModel.appendChild(el)
}

for (const option of DTYPE_OPTIONS) {
  const el = document.createElement("option")
  el.value = option.value
  el.textContent = option.label
  runtimeDType.appendChild(el)
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

function renderRuntimeControls(): void {
  runtimeDevice.value = runtimeState.selection.device
  runtimeModel.value = runtimeState.selection.model.id
  runtimeDType.value = runtimeState.selection.dtype

  for (const option of Array.from(runtimeDevice.options)) {
    const value = option.value as DemoRuntimeSelection["device"]
    const allowed = runtimeState.preset.allowedDevices.includes(value)
    option.disabled = !allowed
    option.textContent = allowed
      ? getDeviceLabel(value)
      : `${getDeviceLabel(value)} (not verified)`
  }

  for (const option of Array.from(runtimeDType.options)) {
    const value = option.value as DemoRuntimeSelection["dtype"]
    const allowed = runtimeState.preset.allowedDTypes.includes(value)
    option.disabled = !allowed
    option.textContent = allowed
      ? getDTypeLabel(value)
      : `${getDTypeLabel(value)} (not verified)`
  }

  runtimeMessage.textContent =
    runtimeState.repairs.map((repair) => repair.message).join(" ") ||
    runtimeState.preset.note ||
    runtimeState.preset.description
}

function renderRuntimeStatus(): void {
  const resolved = translators.map((_, index) => {
    const snapshot = latestSnapshots.get(index)
    return `#${index + 1}: ${snapshot?.enablement.verdict.resolvedDevice ?? "none"}`
  })
  const selection = runtimeState.selection
  const requestedModel = formatRequestedModelIdentity(
    runtimeState.requested.model,
    runtimeState.requested.modelId,
    runtimeState.preset.id,
  )

  runtimeStatus.textContent = [
    `Requested Model: ${requestedModel}.`,
    `Model Spec: ${selection.model.id}.`,
    `Resolved Model: ${selection.model.resolvedModelId}.`,
    `Adapter: ${selection.model.adapterId}.`,
    `DType: ${formatRequestedDType(runtimeState.requested.dtype, runtimeState.preset.defaultDType)} -> ${getDTypeLabel(selection.dtype)} (${selection.dtype}).`,
    `Requested Device: ${formatRequestedDevice(runtimeState.requested.device, runtimeState.preset.defaultDevice)} -> ${getDeviceLabel(selection.device)} (${selection.device}).`,
    `Resolved Device: ${resolved.join(" | ")}.`,
  ].join(" ")
}

function applyRuntimeState(nextState: ResolvedDemoRuntimeSelection): void {
  const nextKey = createDemoRuntimeSelectionKey(nextState.selection)
  const runtimeChanged = nextKey !== runtimeKey

  if (runtimeChanged) {
    restoreTranslators(translators)
    latestSnapshots.clear()
    runtimeKey = nextKey
  }

  runtimeState = nextState
  renderRuntimeControls()
  syncUrl()
  syncTranslatorRuntimeAttrs(translators, runtimeState.selection)
  renderRuntimeStatus()
}

translateSpanishButton.addEventListener("click", () => {
  setTranslatorLanguage(translators, "es")
})

translateArabicButton.addEventListener("click", () => {
  setTranslatorLanguage(translators, "ar")
})

restoreButton.addEventListener("click", () => {
  restoreTranslators(translators)
})

runtimeDevice.addEventListener("change", () => {
  applyRuntimeState(
    mergeDemoRuntimeSelection(runtimeState, {
      device: runtimeDevice.value as DemoRuntimeSelection["device"],
    }),
  )
})

runtimeModel.addEventListener("change", () => {
  applyRuntimeState(
    mergeDemoRuntimeSelection(runtimeState, {
      model: runtimeModel.value,
    }),
  )
})

runtimeDType.addEventListener("change", () => {
  applyRuntimeState(
    mergeDemoRuntimeSelection(runtimeState, {
      dtype: runtimeDType.value as DemoRuntimeSelection["dtype"],
    }),
  )
})

translators.forEach((el, i) => {
  el.addEventListener("babulfish-status", (event) => {
    if (!(event instanceof CustomEvent)) return
    latestSnapshots.set(i, event.detail as Snapshot)
    appendStatusEntry(eventLog, i, event.detail, console)
    renderRuntimeStatus()
  })
})

applyRuntimeState(runtimeState)
observeHostDocument(document.body, [eventLog, hostControls], console)

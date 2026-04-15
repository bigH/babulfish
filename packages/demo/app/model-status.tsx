"use client"

import { useTranslator, type ModelState, type TranslationState } from "@babulfish/react"

const CHECKING_LABEL = "Checking"

type StatusRow = {
  readonly label: string
  readonly value: string
}

function formatWebGPUStatus(
  capabilitiesReady: boolean,
  hasWebGPU: boolean,
): string {
  if (!capabilitiesReady) return CHECKING_LABEL
  return hasWebGPU ? "Supported" : "Not available"
}

function formatTranslationPath(
  capabilitiesReady: boolean,
  canTranslate: boolean,
  device: ReturnType<typeof useTranslator>["device"],
): string {
  if (!capabilitiesReady) return CHECKING_LABEL
  if (!canTranslate) return "Unavailable"
  return device === "webgpu" ? "WebGPU" : "WASM fallback"
}

function formatDefaultButtonStatus(
  capabilitiesReady: boolean,
  isMobile: boolean,
  canTranslate: boolean,
): string {
  if (!capabilitiesReady) return CHECKING_LABEL
  if (isMobile) return "Desktop only for now"
  return canTranslate ? "Available" : "Unavailable"
}

function formatModelStatus(model: ModelState): string {
  switch (model.status) {
    case "idle":
      return "Not loaded"
    case "downloading":
      return `Downloading (${Math.round(model.progress * 100)}%)`
    case "ready":
      return "Ready"
    case "error":
      return "Error"
  }
}

function formatTranslationStatus(translation: TranslationState): string {
  switch (translation.status) {
    case "idle":
      return "Idle"
    case "translating":
      return `Translating (${Math.round(translation.progress * 100)}%)`
  }
}

export function ModelStatus() {
  const {
    model,
    translation,
    currentLanguage,
    capabilitiesReady,
    hasWebGPU,
    canTranslate,
    device,
    isMobile,
  } = useTranslator()

  const rows: ReadonlyArray<StatusRow> = [
    {
      label: "WebGPU",
      value: formatWebGPUStatus(capabilitiesReady, hasWebGPU),
    },
    {
      label: "Translation Path",
      value: formatTranslationPath(capabilitiesReady, canTranslate, device),
    },
    {
      label: "Default Button",
      value: formatDefaultButtonStatus(capabilitiesReady, isMobile, canTranslate),
    },
    {
      label: "Model",
      value: formatModelStatus(model),
    },
    {
      label: "Translation",
      value: formatTranslationStatus(translation),
    },
    {
      label: "Language",
      value: currentLanguage ?? "Original",
    },
  ]

  return (
    <section className="rounded-lg border border-gray-200 bg-gray-50 p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">
        Model Status (useTranslator hook)
      </h2>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        {rows.map(({ label, value }) => (
          <div key={label} className="contents">
            <dt className="font-medium text-gray-600">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

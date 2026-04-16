"use client"

import { useEffect, useState } from "react"
import {
  useTranslateDOM,
  useTranslator,
  type ModelState,
  type TranslationState,
} from "@babulfish/react"

const CHECKING_LABEL = "Checking"
const DEMO_ROOT_SELECTOR = "[data-demo-root]"

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

function readDemoRootDirection(): string {
  const root = document.querySelector<HTMLElement>(DEMO_ROOT_SELECTOR)
  return root?.getAttribute("dir") ?? "none"
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
    loadModel,
  } = useTranslator()
  const { progress, translatePage, restorePage } = useTranslateDOM()
  const [rootDirection, setRootDirection] = useState("none")

  useEffect(() => {
    setRootDirection(readDemoRootDirection())
  }, [currentLanguage, progress, translation.status])

  const modelReady = model.status === "ready"
  const translating = translation.status === "translating"
  const canDriveTranslation = modelReady && !translating
  const canRestore = modelReady && currentLanguage !== null && !translating

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
      label: "Hook Progress",
      value: progress === null ? "None" : `${Math.round(progress * 100)}%`,
    },
    {
      label: "Language",
      value: currentLanguage ?? "Original",
    },
    {
      label: "Translated Root Direction",
      value: rootDirection,
    },
  ]

  return (
    <section className="space-y-4 rounded-3xl border border-gray-200 bg-gray-50 p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            React Boundary Proof
          </h2>
          <p className="text-lg font-semibold text-gray-900">
            This panel sits outside the translated roots and reads the live provider
            snapshot through <code>useTranslator()</code> and <code>useTranslateDOM()</code>.
          </p>
          <p className="text-sm text-gray-600">
            Load the model, translate to a left-to-right language, switch to Arabic
            for RTL, then restore. The fixed globe button remains the shipped stock
            <code> &lt;TranslateButton /&gt;</code>.
          </p>
        </div>

        <div className="grid gap-2 sm:grid-cols-2 lg:w-[24rem]">
          <button
            type="button"
            className="rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300"
            disabled={model.status !== "idle"}
            onClick={() => {
              void loadModel()
            }}
          >
            Load model
          </button>
          <button
            type="button"
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canDriveTranslation}
            onClick={() => {
              void translatePage("es-ES")
            }}
          >
            Translate to Spanish
          </button>
          <button
            type="button"
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canDriveTranslation}
            onClick={() => {
              void translatePage("ar")
            }}
          >
            Translate to Arabic (RTL)
          </button>
          <button
            type="button"
            className="rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!canRestore}
            onClick={() => {
              restorePage()
            }}
          >
            Restore original
          </button>
        </div>
      </div>

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

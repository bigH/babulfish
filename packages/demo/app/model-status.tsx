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

type ActionButton = {
  readonly label: string
  readonly disabled: boolean
  readonly onClick: () => void
  readonly tone: "primary" | "secondary"
}

type TranslationAction = {
  readonly label: string
  readonly language: string
}

const ACTION_BUTTON_CLASS_NAMES = {
  primary:
    "rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300",
  secondary:
    "rounded-full border border-gray-300 px-4 py-2 text-sm font-medium text-gray-900 disabled:cursor-not-allowed disabled:opacity-50",
} as const

const TRANSLATION_ACTIONS: ReadonlyArray<TranslationAction> = [
  { label: "Translate to Spanish", language: "es-ES" },
  { label: "Translate to Arabic (RTL)", language: "ar" },
]

function formatPercent(progress: number): string {
  return `${Math.round(progress * 100)}%`
}

function formatCapabilityStatus(
  capabilitiesReady: boolean,
  value: string,
): string {
  if (!capabilitiesReady) return CHECKING_LABEL
  return value
}

function formatModelStatus(model: ModelState): string {
  switch (model.status) {
    case "idle":
      return "Not loaded"
    case "downloading":
      return `Downloading (${formatPercent(model.progress)})`
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
      return `Translating (${formatPercent(translation.progress)})`
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
  const canTranslatePage = modelReady && !translating
  const canRestorePage = modelReady && currentLanguage !== null && !translating
  const translationPath =
    !canTranslate ? "Unavailable" : device === "webgpu" ? "WebGPU" : "WASM fallback"
  const defaultButtonStatus = isMobile ? "Desktop only for now" : canTranslate ? "Available" : "Unavailable"
  const actionButtons: ReadonlyArray<ActionButton> = [
    {
      label: "Load model",
      disabled: model.status !== "idle",
      onClick: () => {
        void loadModel()
      },
      tone: "primary",
    },
    ...TRANSLATION_ACTIONS.map(({ label, language }) => ({
      label,
      disabled: !canTranslatePage,
      onClick: () => {
        void translatePage(language)
      },
      tone: "secondary" as const,
    })),
    {
      label: "Restore original",
      disabled: !canRestorePage,
      onClick: restorePage,
      tone: "secondary",
    },
  ]

  const rows: ReadonlyArray<StatusRow> = [
    {
      label: "WebGPU",
      value: formatCapabilityStatus(
        capabilitiesReady,
        hasWebGPU ? "Supported" : "Not available",
      ),
    },
    {
      label: "Translation Path",
      value: formatCapabilityStatus(capabilitiesReady, translationPath),
    },
    {
      label: "Default Button",
      value: formatCapabilityStatus(capabilitiesReady, defaultButtonStatus),
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
      value: progress === null ? "None" : formatPercent(progress),
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
          {actionButtons.map(({ label, disabled, onClick, tone }) => (
            <button
              key={label}
              type="button"
              className={ACTION_BUTTON_CLASS_NAMES[tone]}
              disabled={disabled}
              onClick={onClick}
            >
              {label}
            </button>
          ))}
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

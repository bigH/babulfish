"use client"

import { useEffect, useState } from "react"
import {
  useTranslateDOM,
  useTranslator,
  type ModelState,
  type TranslationState,
} from "@babulfish/react"

import {
  DEMO_MODEL_PRESETS,
  DEVICE_OPTIONS,
  DTYPE_OPTIONS,
  getDTypeLabel,
  getDeviceLabel,
  type DemoRuntimeSelection,
} from "../../demo-shared/src/runtime-selection.js"
import { useRuntimeSelectionContext } from "./runtime-selection-context"

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

const CONTROL_LABEL_CLASS_NAME = "grid gap-2 text-sm font-medium text-gray-700"
const CONTROL_SELECT_CLASS_NAME =
  "rounded-2xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 disabled:cursor-not-allowed disabled:bg-gray-100"

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

function formatSelectedDevice(device: DemoRuntimeSelection["device"]): string {
  return `${getDeviceLabel(device)} (${device})`
}

function formatSelectedDType(dtype: DemoRuntimeSelection["dtype"]): string {
  return `${getDTypeLabel(dtype)} (${dtype})`
}

function formatSelectedModel(label: string, modelId: string): string {
  return `${label} (${modelId})`
}

function formatResolvedRuntime(
  enablementStatus: ReturnType<typeof useTranslator>["enablement"]["status"],
  resolvedDevice: DemoRuntimeSelection["device"] | null,
): string {
  switch (enablementStatus) {
    case "idle":
      return "Not assessed yet"
    case "assessing":
      return "Assessing current browser"
    case "ready":
    case "error":
      return resolvedDevice === null ? "Unavailable" : getDeviceLabel(resolvedDevice)
  }
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
    capabilities,
    enablement,
    capabilitiesReady,
    device,
    loadModel,
  } = useTranslator()
  const { progress, translatePage, restorePage } = useTranslateDOM()
  const { runtimeState, updateRuntimeSelection } = useRuntimeSelectionContext()
  const [rootDirection, setRootDirection] = useState("none")

  useEffect(() => {
    setRootDirection(readDemoRootDirection())
  }, [currentLanguage, progress, translation.status])

  const modelReady = model.status === "ready"
  const translating = translation.status === "translating"
  const runtimeBusy = model.status === "downloading" || translating
  const canTranslatePage = modelReady && !translating
  const canRestorePage = modelReady && currentLanguage !== null && !translating
  const capabilitiesText = !capabilitiesReady
    ? CHECKING_LABEL
    : [
        capabilities.hasWebGPU ? "webgpu: yes" : "webgpu: no",
        capabilities.isMobile ? "mobile: yes" : "mobile: no",
        capabilities.approxDeviceMemoryGiB === null
          ? "memory: unknown"
          : `memory: ~${capabilities.approxDeviceMemoryGiB} GiB`,
        capabilities.crossOriginIsolated ? "coi: yes" : "coi: no",
      ].join(" / ")

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

  function applyRuntimeSelection(patch: Partial<DemoRuntimeSelection>): void {
    restorePage()
    updateRuntimeSelection(patch)
  }

  const rows: ReadonlyArray<StatusRow> = [
    {
      label: "Selected Device",
      value: formatSelectedDevice(runtimeState.selection.device),
    },
    {
      label: "Selected Model",
      value: formatSelectedModel(
        runtimeState.preset.label,
        runtimeState.selection.modelId,
      ),
    },
    {
      label: "Selected Quantization",
      value: formatSelectedDType(runtimeState.selection.dtype),
    },
    {
      label: "Capabilities",
      value: capabilitiesText,
    },
    {
      label: "Enablement",
      value: `${enablement.status} / ${enablement.verdict.outcome}`,
    },
    {
      label: "Resolved Runtime",
      value: formatResolvedRuntime(enablement.status, device),
    },
    {
      label: "Verdict",
      value: enablement.verdict.reason,
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
    <section className="space-y-5 rounded-3xl border border-gray-200 bg-gray-50 p-6">
      <div className="space-y-4">
        <div className="max-w-2xl space-y-2">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-gray-500">
            React Boundary Proof
          </h2>
          <p className="text-lg font-semibold text-gray-900">
            This panel stays outside <code>[data-demo-root]</code> and reports the
            selected provider config, the enablement verdict, and the live hook
            state from the current React boundary.
          </p>
          <p className="text-sm text-gray-600">
            The runtime selector above remounts{" "}
            <code>&lt;TranslatorProvider /&gt;</code>. The rows below keep the
            requested config separate from the runtime babulfish could actually
            resolve in this browser.
          </p>
        </div>

        <div className="grid gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))]">
          <label className={CONTROL_LABEL_CLASS_NAME}>
            <span>Device</span>
            <select
              className={CONTROL_SELECT_CLASS_NAME}
              disabled={runtimeBusy}
              value={runtimeState.selection.device}
              onChange={(event) => {
                applyRuntimeSelection({
                  device: event.target.value as DemoRuntimeSelection["device"],
                })
              }}
            >
              {DEVICE_OPTIONS.map((option) => {
                const allowed = runtimeState.preset.allowedDevices.includes(option.value)
                return (
                  <option key={option.value} value={option.value} disabled={!allowed}>
                    {allowed ? option.label : `${option.label} (not verified)`}
                  </option>
                )
              })}
            </select>
          </label>

          <label className={CONTROL_LABEL_CLASS_NAME}>
            <span>Model</span>
            <select
              className={CONTROL_SELECT_CLASS_NAME}
              disabled={runtimeBusy}
              value={runtimeState.selection.modelId}
              onChange={(event) => {
                applyRuntimeSelection({ modelId: event.target.value })
              }}
            >
              {DEMO_MODEL_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.modelId}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>

          <label className={CONTROL_LABEL_CLASS_NAME}>
            <span>Quantization</span>
            <select
              className={CONTROL_SELECT_CLASS_NAME}
              disabled={runtimeBusy}
              value={runtimeState.selection.dtype}
              onChange={(event) => {
                applyRuntimeSelection({
                  dtype: event.target.value as DemoRuntimeSelection["dtype"],
                })
              }}
            >
              {DTYPE_OPTIONS.map((option) => {
                const allowed = runtimeState.preset.allowedDTypes.includes(option.value)
                return (
                  <option key={option.value} value={option.value} disabled={!allowed}>
                    {allowed ? option.label : `${option.label} (not verified)`}
                  </option>
                )
              })}
            </select>
          </label>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600">
          <p className="font-medium text-gray-900">{runtimeState.preset.label}</p>
          <p className="mt-1">{runtimeState.preset.description}</p>
          <p className="mt-2">
            {runtimeState.repairs.map((repair) => repair.message).join(" ") ||
              runtimeState.preset.note}
          </p>
          <p className="mt-2 text-xs uppercase tracking-[0.16em] text-gray-500">
            Allowed quantization:{" "}
            {runtimeState.preset.allowedDTypes.map(getDTypeLabel).join(" / ")}. Allowed
            devices: {runtimeState.preset.allowedDevices.map(getDeviceLabel).join(" / ")}.
          </p>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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

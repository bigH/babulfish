/// <reference types="@testing-library/jest-dom" />
import type { ReactNode } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { resolveDemoRuntimeSelection } from "../../demo-shared/src/runtime-selection.js"

const providerConfigs: unknown[] = []
const restorePage = vi.fn()
const translatePage = vi.fn()
const loadModel = vi.fn()

vi.mock("@babulfish/react", () => ({
  TranslatorProvider: ({
    config,
    children,
  }: {
    config: unknown
    children: ReactNode
  }) => {
    providerConfigs.push(config)
    return <>{children}</>
  },
  TranslateButton: () => <button type="button">Translate Button</button>,
  useTranslator: () => ({
    model: { status: "idle" as const },
    translation: { status: "idle" as const },
    currentLanguage: null,
    capabilities: {
      ready: true,
      hasWebGPU: true,
      isMobile: false,
      approxDeviceMemoryGiB: 16,
      crossOriginIsolated: true,
    },
    enablement: {
      status: "ready" as const,
      modelProfile: null,
      inference: null,
      verdict: {
        outcome: "gpu-preferred" as const,
        resolvedDevice: "webgpu" as const,
        reason: "mock ready",
      },
    },
    capabilitiesReady: true,
    hasWebGPU: true,
    canTranslate: true,
    device: "webgpu" as const,
    isMobile: false,
    loadModel,
  }),
  useTranslateDOM: () => ({
    progress: null,
    translatePage,
    restorePage,
  }),
}))

import { DemoTranslatorShell } from "./demo-translator-shell"
import { ModelStatus } from "./model-status"

describe("DemoTranslatorShell", () => {
  beforeEach(() => {
    providerConfigs.length = 0
    restorePage.mockReset()
    translatePage.mockReset()
    loadModel.mockReset()
    document.body.innerHTML = `<div data-demo-root></div>`
    window.history.replaceState(null, "", "/")
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("hydrates the initial runtime selection without recoverable errors", async () => {
    const initialRuntimeState = resolveDemoRuntimeSelection({
      device: "wasm",
      modelId: "onnx-community/gemma-3-270m-it-ONNX",
      dtype: "fp32",
    })
    const html = renderToString(
      <DemoTranslatorShell initialRuntimeState={initialRuntimeState}>
        <ModelStatus />
      </DemoTranslatorShell>,
    )
    const container = document.createElement("div")
    container.innerHTML = html
    document.body.appendChild(container)
    const onRecoverableError = vi.fn()

    await act(async () => {
      hydrateRoot(
        container,
        <DemoTranslatorShell initialRuntimeState={initialRuntimeState}>
          <ModelStatus />
        </DemoTranslatorShell>,
        { onRecoverableError },
      )
      await Promise.resolve()
    })

    expect(onRecoverableError).not.toHaveBeenCalled()
    expect(container.textContent).toContain("onnx-community/gemma-3-270m-it-ONNX")
    expect(container.textContent).toContain("fp32")
    expect(providerConfigs.at(-1)).toMatchObject({
      engine: {
        device: "wasm",
        modelId: "onnx-community/gemma-3-270m-it-ONNX",
        dtype: "fp32",
      },
    })
  })

  it("updates the provider engine config when the runtime controls change", async () => {
    const initialRuntimeState = resolveDemoRuntimeSelection({})

    window.history.replaceState(null, "", "/?foo=bar")

    const { rerender } = render(
      <DemoTranslatorShell initialRuntimeState={initialRuntimeState}>
        <ModelStatus />
      </DemoTranslatorShell>,
    )

    fireEvent.change(screen.getByLabelText("Model"), {
      target: { value: "onnx-community/gemma-3-270m-it-ONNX" },
    })

    expect(restorePage).toHaveBeenCalledTimes(1)
    expect(providerConfigs.at(-1)).toMatchObject({
      engine: {
        device: "wasm",
        modelId: "onnx-community/gemma-3-270m-it-ONNX",
        dtype: "fp32",
      },
    })
    expect(screen.getByText(/Allowed quantization:/).textContent).toContain(
      "Allowed quantization: FP32. Allowed devices: WASM.",
    )
    expect(window.location.search).toBe(
      "?foo=bar&device=wasm&modelId=onnx-community%2Fgemma-3-270m-it-ONNX&dtype=fp32",
    )

    rerender(
      <DemoTranslatorShell
        initialRuntimeState={resolveDemoRuntimeSelection({
          device: "wasm",
          modelId: "onnx-community/gemma-3-270m-it-ONNX",
          dtype: "fp32",
        })}
      >
        <ModelStatus />
      </DemoTranslatorShell>,
    )

    expect(providerConfigs.at(-1)).toMatchObject({
      engine: {
        device: "wasm",
        modelId: "onnx-community/gemma-3-270m-it-ONNX",
        dtype: "fp32",
      },
    })
  })
})

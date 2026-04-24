/// <reference types="@testing-library/jest-dom" />
import type { ReactNode } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  resolveDemoRuntimeSelection,
  toBabulfishEngineConfig,
} from "../../demo-shared/src/runtime-selection.js"

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
      probe: { status: "not-run" as const, kind: "adapter-smoke" as const, cache: null, note: "" },
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
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
    })
    window.history.replaceState(
      null,
      "",
      "/?foo=bar&modelId=onnx-community%2FQwen2.5-0.5B-Instruct",
    )
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
    expect(container.textContent).toContain(
      "Qwen 2.5 0.5B Instruct (qwen-2.5-0.5b)",
    )
    expect(container.textContent).toContain("onnx-community/Qwen2.5-0.5B-Instruct")
    expect(container.textContent).toContain("qwen-2.5-0.5b-chat")
    expect(window.location.search).toBe("?foo=bar&model=qwen-2.5-0.5b")
    expect(providerConfigs.at(-1)).toEqual({
      engine: toBabulfishEngineConfig(initialRuntimeState.selection),
      dom: {
        roots: ["[data-demo-root]"],
        preserve: {
          matchers: ["babulfish", "Next.js", "TranslateGemma", "WebGPU"],
        },
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

    fireEvent.change(screen.getByLabelText("Model spec"), {
      target: { value: "qwen-3-0.6b" },
    })

    expect(restorePage).toHaveBeenCalledTimes(1)
    expect(providerConfigs.at(-1)).toMatchObject({
      engine: {
        device: "webgpu",
        model: "qwen-3-0.6b",
        dtype: "q4f16",
      },
    })
    expect(providerConfigs.at(-1)).not.toMatchObject({
      engine: {
        modelId: expect.any(String),
      },
    })
    expect(screen.getByLabelText<HTMLSelectElement>("Model spec").value).toBe(
      "qwen-3-0.6b",
    )
    expect(screen.getByText("Model Spec")).toBeTruthy()
    expect(screen.getByText("Resolved Model")).toBeTruthy()
    expect(screen.getByText("Adapter")).toBeTruthy()
    expect(screen.getByText("Requested Device")).toBeTruthy()
    expect(screen.getByText("Effective Device")).toBeTruthy()
    expect(screen.getByText("Requested Quantization")).toBeTruthy()
    expect(screen.getByText("Effective Quantization")).toBeTruthy()
    expect(screen.getByText("Qwen 3 0.6B (qwen-3-0.6b)")).toBeTruthy()
    expect(screen.getByText("onnx-community/Qwen3-0.6B-ONNX")).toBeTruthy()
    expect(screen.getByText("qwen-3-0.6b-chat")).toBeTruthy()
    expect(screen.getByText(/Allowed quantization:/).textContent).toContain(
      "Allowed quantization: Q4F16. Allowed devices: WebGPU.",
    )
    expect(window.location.search).toBe("?foo=bar&model=qwen-3-0.6b")

    rerender(
      <DemoTranslatorShell
        initialRuntimeState={resolveDemoRuntimeSelection({
          model: "qwen-3-0.6b",
        })}
      >
        <ModelStatus />
      </DemoTranslatorShell>,
    )

    expect(providerConfigs.at(-1)).toMatchObject({
      engine: {
        device: "webgpu",
        model: "qwen-3-0.6b",
        dtype: "q4f16",
      },
    })
  })
})

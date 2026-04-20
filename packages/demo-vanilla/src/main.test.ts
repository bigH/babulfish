// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

function createMockCore() {
  return {
    snapshot: {
      model: { status: "idle" as const },
      translation: { status: "idle" as const },
      currentLanguage: null,
      capabilities: {
        ready: true as const,
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
          outcome: "wasm-only" as const,
          resolvedDevice: "wasm" as const,
          reason: "mock ready",
        },
      },
    },
    subscribe: vi.fn(() => vi.fn()),
    loadModel: vi.fn(() => Promise.resolve()),
    translateTo: vi.fn(() => Promise.resolve()),
    translateText: vi.fn(() => Promise.resolve("translated")),
    restore: vi.fn(),
    abort: vi.fn(),
    dispose: vi.fn(() => Promise.resolve()),
    languages: [{ code: "es", label: "Spanish" }],
  }
}

type MockCore = ReturnType<typeof createMockCore>

const createdCores: MockCore[] = []
const mockCreateBabulfish = vi.fn((_config?: unknown): MockCore => {
  const core = createMockCore()
  createdCores.push(core)
  return core
})

vi.mock("@babulfish/core", () => ({
  createBabulfish: (config?: unknown) => mockCreateBabulfish(config),
}))

vi.mock("@babulfish/styles/css", () => ({}))

function setDom(): void {
  document.body.innerHTML = `
    <select id="runtime-device"></select>
    <select id="runtime-model"></select>
    <select id="runtime-dtype"></select>
    <input id="runtime-autoload" type="checkbox" />
    <p id="runtime-preset"></p>
    <p id="runtime-message"></p>
    <p id="runtime-constraints"></p>
    <select id="language"><option value="">Choose language…</option></select>
    <button id="restore" type="button"></button>
    <button id="load-model" type="button"></button>
    <div id="status-requested-device"></div>
    <div id="status-requested-model"></div>
    <div id="status-requested-dtype"></div>
    <div id="status-capabilities"></div>
    <div id="status-enablement"></div>
    <div id="status-verdict"></div>
    <div id="status-runtime"></div>
    <div id="status-model"></div>
    <div id="status-translation"></div>
    <div id="status-language"></div>
    <div id="status-direction"></div>
    <button id="translate-text" type="button"></button>
    <output id="status-raw-text"></output>
    <article data-demo-copy></article>
    <aside data-demo-aside></aside>
    <div data-structured></div>
  `
}

describe("demo-vanilla main", () => {
  beforeEach(() => {
    vi.resetModules()
    createdCores.length = 0
    mockCreateBabulfish.mockClear()
    setDom()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ""
  })

  it("shows default status values without preset suffixes", async () => {
    window.history.replaceState(null, "", "/")

    await import("./main.js")

    expect(document.getElementById("status-requested-device")?.textContent).toBe("Auto")
    expect(document.getElementById("status-requested-model")?.textContent).toBe(
      "onnx-community/translategemma-text-4b-it-ONNX",
    )
    expect(document.getElementById("status-requested-dtype")?.textContent).toBe("Q4")
  })

  it("canonicalizes unsupported runtime params before booting the demo core", async () => {
    window.history.replaceState(
      null,
      "",
      "/?foo=bar&device=webgpu&modelId=onnx-community/gemma-3-270m-it-ONNX&dtype=q4",
    )

    await import("./main.js")

    expect(mockCreateBabulfish).toHaveBeenCalledWith({
      engine: {
        device: "wasm",
        modelId: "onnx-community/gemma-3-270m-it-ONNX",
        dtype: "fp32",
      },
      dom: expect.any(Object),
    })
    expect(window.location.search).toBe(
      "?foo=bar&device=wasm&modelId=onnx-community%2Fgemma-3-270m-it-ONNX&dtype=fp32",
    )
    expect(document.getElementById("runtime-message")?.textContent).toContain(
      "only verified for WASM",
    )
    expect(document.getElementById("status-requested-device")?.textContent).toBe("WebGPU")
    expect(document.getElementById("status-requested-model")?.textContent).toBe(
      "onnx-community/gemma-3-270m-it-ONNX",
    )
    expect(document.getElementById("status-requested-dtype")?.textContent).toBe("Q4")

    const runtimeDevice = document.getElementById("runtime-device")
    if (!(runtimeDevice instanceof HTMLSelectElement)) {
      throw new Error("Expected #runtime-device select")
    }

    expect(Array.from(runtimeDevice.options).map((option) => ({
      value: option.value,
      label: option.textContent,
      disabled: option.disabled,
    }))).toEqual([
      {
        value: "auto",
        label: "Auto (not verified for this preset)",
        disabled: true,
      },
      { value: "wasm", label: "WASM", disabled: false },
      {
        value: "webgpu",
        label: "WebGPU (not verified for this preset)",
        disabled: true,
      },
    ])

    const runtimeDType = document.getElementById("runtime-dtype")
    if (!(runtimeDType instanceof HTMLSelectElement)) {
      throw new Error("Expected #runtime-dtype select")
    }

    expect(Array.from(runtimeDType.options).map((option) => ({
      value: option.value,
      label: option.textContent,
      disabled: option.disabled,
    }))).toEqual([
      { value: "q4", label: "Q4 (not verified for this preset)", disabled: true },
      { value: "q8", label: "Q8 (not verified for this preset)", disabled: true },
      { value: "fp16", label: "FP16 (not verified for this preset)", disabled: true },
      { value: "fp32", label: "FP32", disabled: false },
    ])
  })

  it("recreates the demo core with the normalized runtime selection when the UI changes", async () => {
    window.history.replaceState(null, "", "/")

    await import("./main.js")

    const runtimeModel = document.getElementById("runtime-model")
    if (!(runtimeModel instanceof HTMLSelectElement)) {
      throw new Error("Expected #runtime-model select")
    }

    runtimeModel.value = "onnx-community/gemma-3-270m-it-ONNX"
    runtimeModel.dispatchEvent(new Event("change", { bubbles: true }))

    expect(mockCreateBabulfish).toHaveBeenCalledTimes(2)
    expect(createdCores[0]?.abort).toHaveBeenCalledTimes(1)
    expect(createdCores[0]?.restore).toHaveBeenCalledTimes(1)
    expect(createdCores[0]?.dispose).toHaveBeenCalledTimes(1)
    expect(mockCreateBabulfish.mock.calls[1]?.[0]).toEqual({
      engine: {
        device: "wasm",
        modelId: "onnx-community/gemma-3-270m-it-ONNX",
        dtype: "fp32",
      },
      dom: expect.any(Object),
    })
    expect(window.location.search).toBe(
      "?device=wasm&modelId=onnx-community%2Fgemma-3-270m-it-ONNX&dtype=fp32",
    )
  })
})

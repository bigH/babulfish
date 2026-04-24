import { describe, expect, it, vi } from "vitest"

import { resolveTranslationModelConfig } from "../model-registry.js"
import type { TranslationAdapter } from "../translation-adapter.js"

function customAdapter(id = "custom-adapter"): TranslationAdapter {
  return {
    id,
    label: "Custom adapter",
    validateOptions: vi.fn(() => ({ warnings: [], errors: [] })),
    buildInvocation: vi.fn(() => ({
      modelInput: "prompt",
      modelOptions: { max_new_tokens: 1 },
    })),
    extractText: vi.fn(() => ({ text: "translated" })),
  }
}

describe("resolveTranslationModelConfig", () => {
  it("resolves the default request to TranslateGemma", () => {
    const resolved = resolveTranslationModelConfig()

    expect(resolved.requestedModel).toEqual({
      kind: "default",
      id: "translategemma-4",
      modelIdOverride: null,
    })
    expect(resolved.resolvedModel).toMatchObject({
      id: "translategemma-4",
      label: "TranslateGemma 4B",
      modelId: "onnx-community/translategemma-text-4b-it-ONNX",
      adapterId: "translategemma",
      subfolder: null,
      modelFileName: null,
    })
    expect(resolved.dtype).toBe("q4")
    expect(resolved.device).toBe("auto")
  })

  it.each([
    ["translategemma-4", "onnx-community/translategemma-text-4b-it-ONNX", "translategemma"],
    ["qwen-2.5-0.5b", "onnx-community/Qwen2.5-0.5B-Instruct", "chat"],
    ["qwen-3-0.6b", "onnx-community/Qwen3-0.6B-ONNX", "chat"],
    ["gemma-3-1b-it", "onnx-community/gemma-3-1b-it-ONNX", "chat"],
  ] as const)("resolves built-in model %s", (model, modelId, adapterId) => {
    const resolved = resolveTranslationModelConfig({ model })

    expect(resolved.requestedModel).toEqual({
      kind: "builtin",
      id: model,
      modelIdOverride: null,
    })
    expect(resolved.modelId).toBe(modelId)
    expect(resolved.adapterId).toBe(adapterId)
  })

  it("rejects unknown string model ids", () => {
    expect(() =>
      resolveTranslationModelConfig({ model: "onnx-community/anything" as never }),
    ).toThrow("Unknown translation model: onnx-community/anything")
  })

  it("validates custom specs and accepts adapter objects", () => {
    expect(() =>
      resolveTranslationModelConfig({
        model: { id: "", label: "Custom", modelId: "acme/model", adapter: customAdapter() },
      }),
    ).toThrow("id must be a non-empty string")

    expect(() =>
      resolveTranslationModelConfig({
        model: { id: "custom", label: "", modelId: "acme/model", adapter: customAdapter() },
      }),
    ).toThrow("label must be a non-empty string")

    expect(() =>
      resolveTranslationModelConfig({
        model: { id: "custom", label: "Custom", modelId: "", adapter: customAdapter() },
      }),
    ).toThrow("modelId must be a non-empty string")

    expect(() =>
      resolveTranslationModelConfig({
        model: {
          id: "custom",
          label: "Custom",
          modelId: "acme/model",
          adapter: "missing" as never,
        },
      }),
    ).toThrow("adapter must be a translation adapter object")

    expect(
      resolveTranslationModelConfig({
        model: {
          id: "custom-object",
          label: "Custom object",
          modelId: "acme/model",
          adapter: customAdapter(),
        },
      }).adapterId,
    ).toBe("custom-adapter")
  })

  it("keeps the TranslateGemma adapter for legacy modelId-only config", () => {
    const resolved = resolveTranslationModelConfig({ modelId: "acme/translator" })

    expect(resolved.requestedModel).toEqual({
      kind: "legacy-model-id",
      id: "translategemma-4",
      modelIdOverride: "acme/translator",
    })
    expect(resolved.modelId).toBe("acme/translator")
    expect(resolved.adapterId).toBe("translategemma")
    expect(resolved.subfolder).toBeNull()
    expect(resolved.modelFileName).toBeNull()
    expect(resolved.warnings).toEqual([])
  })

  it("lets legacy modelId override only the selected repo id and emits a warning", () => {
    const resolved = resolveTranslationModelConfig({
      model: "qwen-3-0.6b",
      modelId: "acme/qwen-override",
    })

    expect(resolved.modelId).toBe("acme/qwen-override")
    expect(resolved.adapterId).toBe("chat")
    expect(resolved.subfolder).toBe("onnx")
    expect(resolved.modelFileName).toBe("model")
    expect(resolved.requestedModel).toEqual({
      kind: "builtin",
      id: "qwen-3-0.6b",
      modelIdOverride: "acme/qwen-override",
    })
    expect(resolved.warnings).toEqual([
      "engine.modelId overrides the selected model repo with acme/qwen-override. " +
        "Adapter defaults still come from engine.model.",
    ])
  })

  it("applies top-level scalar preferences over selected spec defaults", () => {
    const resolved = resolveTranslationModelConfig({
      model: {
        id: "custom",
        label: "Custom model",
        modelId: "acme/model",
        adapter: customAdapter(),
        defaults: {
          dtype: "fp16",
          device: "webgpu",
          maxNewTokens: 77,
        },
      },
      dtype: "q8",
      device: "wasm",
      maxNewTokens: 33,
      sourceLanguage: "de",
    })

    expect(resolved.dtype).toBe("q8")
    expect(resolved.device).toBe("wasm")
    expect(resolved.maxNewTokens).toBe(33)
    expect(resolved.sourceLanguage).toBe("de")
  })

  it("uses q4f16, WebGPU, file location, and probe defaults for chat built-ins", () => {
    const resolved = resolveTranslationModelConfig({ model: "gemma-3-1b-it" })

    expect(resolved).toMatchObject({
      dtype: "q4f16",
      device: "webgpu",
      maxNewTokens: 256,
      sourceLanguage: "en",
      subfolder: "onnx",
      modelFileName: "model",
      probe: "if-needed",
      modelProfile: {
        estimatedWorkingSetGiB: null,
      },
    })
  })
})

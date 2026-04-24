import { describe, expect, it } from "vitest"

import { createAssessmentCacheKey, type RuntimePreferenceConfig } from "../runtime-plan.js"
import type { CapabilityObservation } from "../../core/capabilities.js"
import type { TranslationAdapter } from "../translation-adapter.js"

function testAdapter(id: string): TranslationAdapter {
  return {
    id,
    label: `${id} adapter`,
    validateOptions: () => ({ warnings: [], errors: [] }),
    buildInvocation: () => ({ modelInput: "prompt", modelOptions: { max_new_tokens: 1 } }),
    extractText: () => ({ text: "translated" }),
  }
}

const translateGemmaAdapter = testAdapter("translategemma")
const chatAdapter = testAdapter("chat")

function baseObservation(
  overrides: Partial<CapabilityObservation> = {},
): CapabilityObservation {
  return {
    ready: true,
    hasWebGPU: true,
    isMobile: false,
    approxDeviceMemoryGiB: 16,
    crossOriginIsolated: false,
    ...overrides,
  }
}

function baseConfig(
  overrides: Partial<RuntimePreferenceConfig> = {},
): RuntimePreferenceConfig {
  return {
    modelId: "acme/translator",
    dtype: "q4",
    device: "auto",
    sourceLanguage: "en",
    maxNewTokens: 128,
    ...overrides,
  }
}

describe("createAssessmentCacheKey", () => {
  it("produces the same key for identical inputs", () => {
    const config = baseConfig()
    const observation = baseObservation()

    expect(createAssessmentCacheKey(config, observation)).toBe(
      createAssessmentCacheKey(config, observation),
    )
  })

  it("treats omitted runtime fields the same as explicit defaults", () => {
    const observation = baseObservation()

    expect(createAssessmentCacheKey(undefined, observation)).toBe(
      createAssessmentCacheKey(
        {
          modelId: "onnx-community/translategemma-text-4b-it-ONNX",
          dtype: "q4",
          device: "auto",
          sourceLanguage: "en",
          maxNewTokens: 512,
          enablement: {
            policy: "default",
            modelProfile: "auto",
            probe: "off",
          },
        },
        observation,
      ),
    )
  })

  it("diverges when modelId changes", () => {
    const observation = baseObservation()
    const first = createAssessmentCacheKey(baseConfig({ modelId: "acme/a" }), observation)
    const second = createAssessmentCacheKey(baseConfig({ modelId: "acme/b" }), observation)

    expect(first).not.toBe(second)
  })

  it("diverges when adapter or file location changes", () => {
    const observation = baseObservation()
    const legacy = createAssessmentCacheKey(
      baseConfig({ modelId: "acme/shared" }),
      observation,
    )
    const chat = createAssessmentCacheKey(
      baseConfig({
        model: {
          id: "chat",
          label: "Chat",
          modelId: "acme/shared",
          adapter: chatAdapter,
        },
        modelId: undefined,
      }),
      observation,
    )
    const subfolder = createAssessmentCacheKey(
      baseConfig({
        model: {
          id: "subfolder",
          label: "Subfolder",
          modelId: "acme/shared",
          adapter: translateGemmaAdapter,
          defaults: { subfolder: "onnx" },
        },
        modelId: undefined,
      }),
      observation,
    )
    const file = createAssessmentCacheKey(
      baseConfig({
        model: {
          id: "file",
          label: "File",
          modelId: "acme/shared",
          adapter: translateGemmaAdapter,
          defaults: { modelFileName: "model" },
        },
        modelId: undefined,
      }),
      observation,
    )

    expect(legacy).not.toBe(chat)
    expect(legacy).not.toBe(subfolder)
    expect(legacy).not.toBe(file)
    expect(subfolder).not.toBe(file)
  })

  it("diverges when dtype changes", () => {
    const observation = baseObservation()
    const first = createAssessmentCacheKey(baseConfig({ dtype: "q4" }), observation)
    const second = createAssessmentCacheKey(baseConfig({ dtype: "fp16" }), observation)

    expect(first).not.toBe(second)
  })

  it("diverges when device changes", () => {
    const observation = baseObservation()
    const first = createAssessmentCacheKey(baseConfig({ device: "auto" }), observation)
    const second = createAssessmentCacheKey(baseConfig({ device: "webgpu" }), observation)
    const third = createAssessmentCacheKey(baseConfig({ device: "wasm" }), observation)

    expect(first).not.toBe(second)
    expect(first).not.toBe(third)
    expect(second).not.toBe(third)
  })

  it("diverges when source language or max tokens change", () => {
    const observation = baseObservation()
    const first = createAssessmentCacheKey(
      baseConfig({ sourceLanguage: "en", maxNewTokens: 128 }),
      observation,
    )
    const source = createAssessmentCacheKey(baseConfig({ sourceLanguage: "fr" }), observation)
    const tokens = createAssessmentCacheKey(baseConfig({ maxNewTokens: 64 }), observation)

    expect(first).not.toBe(source)
    expect(first).not.toBe(tokens)
  })

  it("matches equivalent legacy and custom configs with the same execution identity", () => {
    const observation = baseObservation()
    const legacy = createAssessmentCacheKey(
      baseConfig({ modelId: "acme/shared" }),
      observation,
    )
    const custom = createAssessmentCacheKey(
      baseConfig({
        model: {
          id: "custom-id-does-not-enter-execution-key",
          label: "Custom",
          modelId: "acme/shared",
          adapter: translateGemmaAdapter,
        },
        modelId: undefined,
      }),
      observation,
    )

    expect(custom).toBe(legacy)
  })

  it("diverges when modelProfileInput shape changes", () => {
    const observation = baseObservation()
    const auto = createAssessmentCacheKey(
      baseConfig({ enablement: { modelProfile: "auto" } }),
      observation,
    )
    const customA = createAssessmentCacheKey(
      baseConfig({
        enablement: {
          modelProfile: { id: "custom-a", estimatedWorkingSetGiB: 8, note: "a" },
        },
      }),
      observation,
    )
    const customB = createAssessmentCacheKey(
      baseConfig({
        enablement: {
          modelProfile: { id: "custom-b", estimatedWorkingSetGiB: 8, note: "a" },
        },
      }),
      observation,
    )
    const customMemory = createAssessmentCacheKey(
      baseConfig({
        enablement: {
          modelProfile: { id: "custom-a", estimatedWorkingSetGiB: 12, note: "a" },
        },
      }),
      observation,
    )
    const customNote = createAssessmentCacheKey(
      baseConfig({
        enablement: {
          modelProfile: { id: "custom-a", estimatedWorkingSetGiB: 8, note: "b" },
        },
      }),
      observation,
    )

    expect(auto).not.toBe(customA)
    expect(customA).not.toBe(customB)
    expect(customA).not.toBe(customMemory)
    expect(customA).not.toBe(customNote)
  })

  it("diverges when observation fingerprint changes", () => {
    const config = baseConfig()
    const ready = createAssessmentCacheKey(config, baseObservation({ ready: true }))
    const notReady = createAssessmentCacheKey(config, baseObservation({ ready: false }))
    const mobile = createAssessmentCacheKey(config, baseObservation({ isMobile: true }))
    const noGpu = createAssessmentCacheKey(config, baseObservation({ hasWebGPU: false }))
    const lowMemory = createAssessmentCacheKey(
      config,
      baseObservation({ approxDeviceMemoryGiB: 4 }),
    )
    const nullMemory = createAssessmentCacheKey(
      config,
      baseObservation({ approxDeviceMemoryGiB: null }),
    )
    const coi = createAssessmentCacheKey(config, baseObservation({ crossOriginIsolated: true }))

    expect(ready).not.toBe(notReady)
    expect(ready).not.toBe(mobile)
    expect(ready).not.toBe(noGpu)
    expect(ready).not.toBe(lowMemory)
    expect(lowMemory).not.toBe(nullMemory)
    expect(ready).not.toBe(coi)
  })

  it("treats a missing modelProfile.version the same as an empty version", () => {
    const observation = baseObservation()
    const withoutVersion = createAssessmentCacheKey(
      baseConfig({
        enablement: {
          modelProfile: { id: "custom", estimatedWorkingSetGiB: 8, note: "n" },
        },
      }),
      observation,
    )
    const withExplicitEmpty = createAssessmentCacheKey(
      baseConfig({
        enablement: {
          modelProfile: { id: "custom", version: "", estimatedWorkingSetGiB: 8, note: "n" },
        },
      }),
      observation,
    )
    const withRealVersion = createAssessmentCacheKey(
      baseConfig({
        enablement: {
          modelProfile: { id: "custom", version: "2026-04-17", estimatedWorkingSetGiB: 8, note: "n" },
        },
      }),
      observation,
    )

    expect(withoutVersion).toBe(withExplicitEmpty)
    expect(withoutVersion).not.toBe(withRealVersion)
  })
})

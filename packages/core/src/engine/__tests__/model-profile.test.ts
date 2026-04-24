import { describe, expect, it } from "vitest"

import {
  createRuntimePlanKey,
  resolveModelProfile,
  resolveRuntimePreferences,
  type ResolvedRuntimePlan,
} from "../runtime-plan.js"

const RESOLVED_TRANSLATEGEMMA_MODEL = {
  id: "translategemma-4",
  label: "TranslateGemma 4B",
  modelId: "acme/translator",
  adapterId: "translategemma",
  subfolder: null,
  modelFileName: null,
  warnings: [],
} as const

describe("resolveModelProfile", () => {
  it("returns the shipped default profile for the default model config", () => {
    expect(resolveModelProfile()).toEqual({
      id: "translategemma-text-4b-it-onnx-q4",
      version: "2026-04-16",
      modelId: "onnx-community/translategemma-text-4b-it-ONNX",
      dtype: "q4",
      estimatedWorkingSetGiB: 6,
      note:
        "Approximate working-set estimate for the Session 1 system-memory heuristic. Not VRAM.",
    })
  })

  it("falls back to an unknown profile when auto mode finds no shipped match", () => {
    expect(resolveModelProfile({ modelId: "acme/translator" })).toEqual({
      id: "custom:acme/translator:q4",
      version: "user-config",
      modelId: "acme/translator",
      dtype: "q4",
      estimatedWorkingSetGiB: null,
      note:
        "No shipped profile matched this model config, so Session 1 uses an unknown memory estimate.",
    })
  })

  it("uses non-default built-in unknown profiles without drifting to custom ids", () => {
    expect(resolveModelProfile({ model: "qwen-3-0.6b" })).toEqual({
      id: "qwen-3-0.6b-q4f16",
      version: "2026-04-24",
      modelId: "onnx-community/Qwen3-0.6B-ONNX",
      dtype: "q4f16",
      estimatedWorkingSetGiB: null,
      note:
        "No maintained working-set estimate is shipped for this model yet. " +
        "Use the adapter smoke probe to verify WebGPU compatibility.",
    })
  })

  it("builds a custom profile override against the requested model config", () => {
    expect(
      resolveModelProfile({
        modelId: "acme/translator",
        dtype: "fp16",
        enablement: {
          modelProfile: {
            estimatedWorkingSetGiB: 12,
            note: "Maintained by the app.",
          },
        },
      }),
    ).toEqual({
      id: "custom:acme/translator:fp16",
      version: "user-config",
      modelId: "acme/translator",
      dtype: "fp16",
      estimatedWorkingSetGiB: 12,
      note: "Maintained by the app.",
    })
  })

  it("treats omitted runtime fields the same as explicit defaults", () => {
    expect(
      resolveModelProfile({
        modelId: "acme/translator",
      }),
    ).toEqual(
      resolveModelProfile({
        modelId: "acme/translator",
        dtype: "q4",
        device: "auto",
        maxNewTokens: 512,
        sourceLanguage: "en",
        enablement: {
          policy: "default",
          modelProfile: "auto",
          probe: "off",
        },
      }),
    )
  })
})

describe("resolveRuntimePreferences", () => {
  it("fills the execution defaults without mutating the caller config", () => {
    const config = {
      modelId: "acme/translator",
      maxNewTokens: 256,
    } as const

    expect(resolveRuntimePreferences(config)).toMatchObject({
      requestedModel: {
        kind: "legacy-model-id",
        id: "translategemma-4",
        modelIdOverride: "acme/translator",
      },
      resolvedModel: {
        id: "translategemma-4",
        label: "TranslateGemma 4B",
        modelId: "acme/translator",
        adapterId: "translategemma",
        subfolder: null,
        modelFileName: null,
        warnings: [],
      },
      modelId: "acme/translator",
      adapterId: "translategemma",
      dtype: "q4",
      device: "auto",
      maxNewTokens: 256,
      sourceLanguage: "en",
      subfolder: null,
      modelFileName: null,
      enablement: {
        policy: "default",
        modelProfile: "auto",
        probe: "off",
      },
    })
    expect(config).toEqual({
      modelId: "acme/translator",
      maxNewTokens: 256,
    })
  })

  it("lets explicit enablement profile and probe override selected model defaults", () => {
    const resolved = resolveRuntimePreferences({
      model: "qwen-3-0.6b",
      enablement: {
        modelProfile: {
          id: "app-profile",
          estimatedWorkingSetGiB: 4,
        },
        probe: "off",
      },
    })

    expect(resolved.enablement.modelProfile).toEqual({
      id: "app-profile",
      estimatedWorkingSetGiB: 4,
    })
    expect(resolved.enablement.probe).toBe("off")
  })

  it("uses selected model profile and probe defaults when enablement is omitted", () => {
    const resolved = resolveRuntimePreferences({ model: "gemma-3-1b-it" })

    expect(resolved.enablement.modelProfile).toMatchObject({
      id: "gemma-3-1b-it-q4f16",
      estimatedWorkingSetGiB: null,
    })
    expect(resolved.enablement.probe).toBe("if-needed")
  })

  it("keeps selected model profile and probe defaults when spread enablement props are undefined", () => {
    const resolved = resolveRuntimePreferences({
      model: "gemma-3-1b-it",
      enablement: {
        modelProfile: undefined,
        probe: undefined,
      } as never,
    })

    expect(resolved.enablement.modelProfile).toMatchObject({
      id: "gemma-3-1b-it-q4f16",
      estimatedWorkingSetGiB: null,
    })
    expect(resolved.enablement.probe).toBe("if-needed")
  })
})

describe("createRuntimePlanKey", () => {
  it("includes the full execution tuple", () => {
    const plan: ResolvedRuntimePlan = {
      requestedModel: {
        kind: "custom",
        id: "custom",
        modelIdOverride: null,
      },
      resolvedModel: RESOLVED_TRANSLATEGEMMA_MODEL,
      modelId: "acme/translator",
      adapterId: "translategemma",
      dtype: "fp16",
      resolvedDevice: "webgpu",
      sourceLanguage: "fr",
      maxNewTokens: 64,
      subfolder: "onnx",
      modelFileName: "model",
    }

    expect(createRuntimePlanKey(plan)).toBe(
      "acme/translator|translategemma|fp16|webgpu|fr|64|onnx|model",
    )
  })
})

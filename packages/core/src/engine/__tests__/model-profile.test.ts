import { describe, expect, it } from "vitest"

import {
  createRuntimePlanKey,
  resolveModelProfile,
  resolveRuntimePreferences,
} from "../runtime-plan.js"

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

    expect(resolveRuntimePreferences(config)).toEqual({
      modelId: "acme/translator",
      dtype: "q4",
      device: "auto",
      maxNewTokens: 256,
      sourceLanguage: "en",
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
})

describe("createRuntimePlanKey", () => {
  it("includes the full execution tuple", () => {
    expect(
      createRuntimePlanKey({
        modelId: "acme/translator",
        dtype: "fp16",
        resolvedDevice: "webgpu",
        sourceLanguage: "fr",
        maxNewTokens: 64,
      }),
    ).toBe("acme/translator|fp16|webgpu|fr|64")
  })
})

import { beforeEach, describe, expect, it } from "vitest"

import {
  createProbeCacheKey,
  getProbeCacheEntry,
  setProbeCacheEntry,
  __resetProbeCacheForTests,
  type ProbeCacheKeyInput,
  type ProbeOutcome,
} from "../probe-cache.js"
import type { CapabilityObservation } from "../../core/capabilities.js"

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

function baseCacheKeyInput(
  overrides: Partial<ProbeCacheKeyInput> = {},
): ProbeCacheKeyInput {
  return {
    modelProfileId: "translategemma-text-4b-it-onnx-q4",
    modelProfileVersion: "2026-04-16",
    modelId: "onnx-community/translategemma-text-4b-it-ONNX",
    adapterId: "translategemma",
    dtype: "q4",
    device: "auto",
    sourceLanguage: "en",
    maxNewTokens: 512,
    subfolder: null,
    modelFileName: null,
    policyVersion: "default",
    probeVersion: "1",
    observation: baseObservation(),
    ...overrides,
  }
}

const passedOutcome: ProbeOutcome = {
  passed: true,
  features: ["shader-f16"],
  note: "Adapter and device acquired. shader-f16 supported.",
}

const failedOutcome: ProbeOutcome = {
  passed: false,
  features: [],
  note: "No WebGPU adapter available.",
}

beforeEach(() => {
  __resetProbeCacheForTests()
})

describe("createProbeCacheKey", () => {
  it("produces stable keys for identical inputs", () => {
    const input = baseCacheKeyInput()

    expect(createProbeCacheKey(input)).toBe(createProbeCacheKey(input))
  })

  it("includes all configuration components", () => {
    const input = baseCacheKeyInput()
    const key = createProbeCacheKey(input)

    expect(key).toBe(
      [
        input.modelProfileId,
        input.modelProfileVersion,
        input.modelId,
        input.adapterId,
        input.dtype,
        input.device,
        input.sourceLanguage,
        String(input.maxNewTokens),
        "null",
        "null",
        input.policyVersion,
        input.probeVersion,
        "ready",
        "webgpu",
        "desktop",
        "memory:16",
        "no-coi",
      ].join("|"),
    )
  })

  it.each([
    ["modelProfileId", { modelProfileId: "different-profile" }],
    ["modelProfileVersion", { modelProfileVersion: "2099-01-01" }],
    ["modelId", { modelId: "other-org/other-model" }],
    ["adapterId", { adapterId: "chat" }],
    ["dtype", { dtype: "fp16" }],
    ["device", { device: "webgpu" }],
    ["sourceLanguage", { sourceLanguage: "fr" }],
    ["maxNewTokens", { maxNewTokens: 64 }],
    ["subfolder", { subfolder: "onnx" }],
    ["modelFileName", { modelFileName: "model" }],
    ["policyVersion", { policyVersion: "v2" }],
    ["probeVersion", { probeVersion: "2" }],
    ["observation.ready", { observation: baseObservation({ ready: false }) }],
    ["observation.hasWebGPU", { observation: baseObservation({ hasWebGPU: false }) }],
    ["observation.isMobile", { observation: baseObservation({ isMobile: true }) }],
    ["observation.approxDeviceMemoryGiB=8", { observation: baseObservation({ approxDeviceMemoryGiB: 8 }) }],
    ["observation.approxDeviceMemoryGiB=null", { observation: baseObservation({ approxDeviceMemoryGiB: null }) }],
    ["observation.crossOriginIsolated", { observation: baseObservation({ crossOriginIsolated: true }) }],
  ] as const)("produces a different key when %s changes", (_label, override) => {
    const baseline = createProbeCacheKey(baseCacheKeyInput())
    const changed = createProbeCacheKey(baseCacheKeyInput(override))

    expect(changed).not.toBe(baseline)
  })
})

describe("probe cache get/set", () => {
  it("returns undefined for unknown key", () => {
    expect(getProbeCacheEntry("nonexistent")).toBeUndefined()
  })

  it("round-trips correctly", () => {
    const key = "test-key-1"
    setProbeCacheEntry(key, passedOutcome)

    expect(getProbeCacheEntry(key)).toEqual(passedOutcome)
  })

  it("overwrites on same key", () => {
    const key = "overwrite-key"
    setProbeCacheEntry(key, passedOutcome)
    setProbeCacheEntry(key, failedOutcome)

    expect(getProbeCacheEntry(key)).toEqual(failedOutcome)
  })

  it("isolates different keys", () => {
    setProbeCacheEntry("key-a", passedOutcome)
    setProbeCacheEntry("key-b", failedOutcome)

    expect(getProbeCacheEntry("key-a")).toEqual(passedOutcome)
    expect(getProbeCacheEntry("key-b")).toEqual(failedOutcome)
  })

  it("clears all entries on reset", () => {
    setProbeCacheEntry("k1", passedOutcome)
    setProbeCacheEntry("k2", failedOutcome)

    __resetProbeCacheForTests()

    expect(getProbeCacheEntry("k1")).toBeUndefined()
    expect(getProbeCacheEntry("k2")).toBeUndefined()
  })
})

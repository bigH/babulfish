import { describe, expect, it } from "vitest"

import {
  IDLE_ENABLEMENT_STATE,
  NOT_RUN_PROBE_SUMMARY,
  createEnablementCompat,
  type EnablementState,
  type EnablementVerdict,
} from "../runtime-plan.js"

function stateWith(
  verdict: EnablementVerdict,
  status: EnablementState["status"] = "ready",
): EnablementState {
  return {
    status,
    modelProfile: null,
    inference: null,
    probe: NOT_RUN_PROBE_SUMMARY,
    verdict,
  }
}

const UNKNOWN: EnablementVerdict = {
  outcome: "unknown",
  resolvedDevice: null,
  reason: "still computing",
}
const NEEDS_PROBE: EnablementVerdict = {
  outcome: "needs-probe",
  resolvedDevice: null,
  reason: "probe could clear this up",
}
const DENIED: EnablementVerdict = {
  outcome: "denied",
  resolvedDevice: null,
  reason: "WebGPU requested but not available",
}
const GPU: EnablementVerdict = {
  outcome: "gpu-preferred",
  resolvedDevice: "webgpu",
  reason: "fits on WebGPU",
}
const WASM: EnablementVerdict = {
  outcome: "wasm-only",
  resolvedDevice: "wasm",
  reason: "no WebGPU — using WASM",
}

describe("createEnablementCompat", () => {
  it("marks capabilities ready only when assessment is terminal", () => {
    expect(createEnablementCompat(stateWith(GPU, "idle")).capabilitiesReady).toBe(false)
    expect(createEnablementCompat(stateWith(GPU, "assessing")).capabilitiesReady).toBe(false)
    expect(createEnablementCompat(stateWith(GPU, "probing")).capabilitiesReady).toBe(false)
    expect(createEnablementCompat(stateWith(GPU, "ready")).capabilitiesReady).toBe(true)
    expect(createEnablementCompat(stateWith(GPU, "error")).capabilitiesReady).toBe(true)
  })

  it("covers unknown outcome — no translate, no device", () => {
    const compat = createEnablementCompat(stateWith(UNKNOWN))
    expect(compat.canTranslate).toBe(false)
    expect(compat.device).toBeNull()
  })

  it("covers needs-probe outcome — no translate, no device", () => {
    const compat = createEnablementCompat(stateWith(NEEDS_PROBE))
    expect(compat.canTranslate).toBe(false)
    expect(compat.device).toBeNull()
  })

  it("covers denied outcome — no translate, no device", () => {
    const compat = createEnablementCompat(stateWith(DENIED))
    expect(compat.canTranslate).toBe(false)
    expect(compat.device).toBeNull()
  })

  it("covers gpu-preferred outcome — translate on webgpu", () => {
    const compat = createEnablementCompat(stateWith(GPU))
    expect(compat.canTranslate).toBe(true)
    expect(compat.device).toBe("webgpu")
  })

  it("covers wasm-only outcome — translate on wasm", () => {
    const compat = createEnablementCompat(stateWith(WASM))
    expect(compat.canTranslate).toBe(true)
    expect(compat.device).toBe("wasm")
  })

  it("returns a frozen compat so consumers cannot mutate it", () => {
    const compat = createEnablementCompat(IDLE_ENABLEMENT_STATE)
    expect(Object.isFrozen(compat)).toBe(true)
  })
})

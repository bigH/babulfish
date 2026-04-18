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

const VERDICTS = {
  unknown: {
    outcome: "unknown",
    resolvedDevice: null,
    reason: "still computing",
  },
  "needs-probe": {
    outcome: "needs-probe",
    resolvedDevice: null,
    reason: "probe could clear this up",
  },
  denied: {
    outcome: "denied",
    resolvedDevice: null,
    reason: "WebGPU requested but not available",
  },
  "gpu-preferred": {
    outcome: "gpu-preferred",
    resolvedDevice: "webgpu",
    reason: "fits on WebGPU",
  },
  "wasm-only": {
    outcome: "wasm-only",
    resolvedDevice: "wasm",
    reason: "no WebGPU — using WASM",
  },
} as const satisfies Record<EnablementVerdict["outcome"], EnablementVerdict>

describe("createEnablementCompat", () => {
  it.each<[EnablementState["status"], boolean]>([
    ["idle", false],
    ["assessing", false],
    ["probing", false],
    ["ready", true],
    ["error", true],
  ])("marks capabilitiesReady=%s for status=%s only when terminal", (status, expected) => {
    expect(createEnablementCompat(stateWith(VERDICTS["gpu-preferred"], status)).capabilitiesReady)
      .toBe(expected)
  })

  it.each<[EnablementVerdict["outcome"], boolean, EnablementVerdict["resolvedDevice"]]>([
    ["unknown", false, null],
    ["needs-probe", false, null],
    ["denied", false, null],
    ["gpu-preferred", true, "webgpu"],
    ["wasm-only", true, "wasm"],
  ])(
    "maps outcome=%s to canTranslate=%s and device=%s",
    (outcome, canTranslate, device) => {
      const compat = createEnablementCompat(stateWith(VERDICTS[outcome]))
      expect(compat.canTranslate).toBe(canTranslate)
      expect(compat.device).toBe(device)
    },
  )

  it("returns a frozen compat so consumers cannot mutate it", () => {
    expect(Object.isFrozen(createEnablementCompat(IDLE_ENABLEMENT_STATE))).toBe(true)
  })
})

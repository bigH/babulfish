import { describe, expect, it } from "vitest"

import { assessRuntimeEnablement, inferModelFit, resolveModelProfile } from "../runtime-plan.js"
import type { CapabilityObservation } from "../../core/capabilities.js"

function browserObservation(
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

describe("inferModelFit", () => {
  it("records an honest unknown when approximate memory is unavailable", () => {
    const profile = resolveModelProfile()

    expect(
      inferModelFit(
        browserObservation({ approxDeviceMemoryGiB: null }),
        profile,
      ),
    ).toEqual({
      outcome: "unknown",
      basis: "system-memory-heuristic",
      expectedModelMemoryGiB: 6,
      approxDeviceMemoryGiB: null,
      note: "Approximate system memory is unavailable, so Session 1 cannot estimate WebGPU fit.",
    })
  })

  it("uses the mobile 50% threshold", () => {
    const profile = resolveModelProfile()

    expect(
      inferModelFit(
        browserObservation({ isMobile: true, approxDeviceMemoryGiB: 16 }),
        profile,
      ).outcome,
    ).toBe("likely-fit")

    expect(
      inferModelFit(
        browserObservation({ isMobile: true, approxDeviceMemoryGiB: 8 }),
        profile,
      ).outcome,
    ).toBe("likely-no-fit")
  })
})

describe("assessRuntimeEnablement", () => {
  it("uses WASM when auto mode lacks WebGPU", () => {
    const assessment = assessRuntimeEnablement(undefined, browserObservation({ hasWebGPU: false }))

    expect(assessment.verdict).toEqual({
      outcome: "wasm-only",
      resolvedDevice: "wasm",
      reason: "WebGPU is unavailable here, so babulfish will use WASM.",
    })
    expect(assessment.runtimePlan?.resolvedDevice).toBe("wasm")
  })

  it("prefers WebGPU when the heuristic says the default profile fits", () => {
    const assessment = assessRuntimeEnablement(undefined, browserObservation())

    expect(assessment.verdict.outcome).toBe("gpu-preferred")
    expect(assessment.runtimePlan?.resolvedDevice).toBe("webgpu")
    expect(assessment.inference?.basis).toBe("system-memory-heuristic")
  })

  it("falls back to WASM when auto mode lacks enough headroom", () => {
    const assessment = assessRuntimeEnablement(
      undefined,
      browserObservation({ approxDeviceMemoryGiB: 6.5 }),
    )

    expect(assessment.verdict).toEqual({
      outcome: "wasm-only",
      resolvedDevice: "wasm",
      reason:
        "The Session 1 memory heuristic says WebGPU is unlikely to fit, so babulfish will use WASM.",
    })
    expect(assessment.runtimePlan?.resolvedDevice).toBe("wasm")
  })

  it("denies forced WebGPU when the browser lacks WebGPU", () => {
    const assessment = assessRuntimeEnablement(
      { device: "webgpu" },
      browserObservation({ hasWebGPU: false }),
    )

    expect(assessment.verdict).toEqual({
      outcome: "denied",
      resolvedDevice: null,
      reason: "WebGPU was explicitly requested, but this browser does not expose WebGPU.",
    })
    expect(assessment.runtimePlan).toBeNull()
  })

  it("forces WASM when explicitly requested", () => {
    const assessment = assessRuntimeEnablement(
      { device: "wasm" },
      browserObservation(),
    )

    expect(assessment.verdict).toEqual({
      outcome: "wasm-only",
      resolvedDevice: "wasm",
      reason: "WASM was explicitly requested.",
    })
    expect(assessment.inference).toBeNull()
  })

  it("uses a conservative WASM verdict when custom memory data is missing", () => {
    const assessment = assessRuntimeEnablement(
      {
        enablement: {
          modelProfile: {
            estimatedWorkingSetGiB: null,
          },
        },
      },
      browserObservation(),
    )

    expect(assessment.inference?.outcome).toBe("unknown")
    expect(assessment.verdict).toEqual({
      outcome: "wasm-only",
      resolvedDevice: "wasm",
      reason:
        "Approximate system memory is too weak for a confident WebGPU fit, so babulfish will use WASM.",
    })
  })
})

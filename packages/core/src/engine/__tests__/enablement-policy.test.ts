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
  it.each([
    ["auto before any heuristic branch", undefined, browserObservation({ ready: false })],
    ["explicit wasm", { device: "wasm" } as const, browserObservation({ ready: false })],
    [
      "explicit webgpu even when the browser also lacks WebGPU",
      { device: "webgpu" } as const,
      browserObservation({ ready: false, hasWebGPU: false }),
    ],
  ])("keeps readiness precedence for %s", (_label, config, observation) => {
    const assessment = assessRuntimeEnablement(config, observation)

    expect(assessment.verdict).toEqual({
      outcome: "unknown",
      resolvedDevice: null,
      reason: "Capability observations are not ready yet.",
    })
    expect(assessment.runtimePlan).toBeNull()
  })

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

  it("builds the full runtime plan from the resolved config", () => {
    const assessment = assessRuntimeEnablement(
      {
        dtype: "q8",
        maxNewTokens: 256,
        sourceLanguage: "fr",
      },
      browserObservation({ approxDeviceMemoryGiB: 32 }),
    )

    expect(assessment.runtimePlan).toEqual({
      modelId: "onnx-community/translategemma-text-4b-it-ONNX",
      dtype: "q8",
      resolvedDevice: "webgpu",
      sourceLanguage: "fr",
      maxNewTokens: 256,
    })
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

  it("returns needs-probe when custom memory data is missing", () => {
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
      outcome: "needs-probe",
      resolvedDevice: null,
      reason:
        "Session 1 memory heuristic is inconclusive. A probe could verify WebGPU compatibility.",
    })
  })
})

describe("needs-probe verdict", () => {
  it("auto device with unknown inference produces needs-probe", () => {
    const assessment = assessRuntimeEnablement(
      undefined,
      browserObservation({ approxDeviceMemoryGiB: null }),
    )

    expect(assessment.verdict.outcome).toBe("needs-probe")
  })

  it("auto device with null memory produces needs-probe", () => {
    const assessment = assessRuntimeEnablement(
      { device: "auto" },
      browserObservation({ approxDeviceMemoryGiB: null }),
    )

    expect(assessment.verdict.outcome).toBe("needs-probe")
  })

  it("explicit webgpu with unknown inference produces needs-probe", () => {
    const assessment = assessRuntimeEnablement(
      { device: "webgpu" },
      browserObservation({ approxDeviceMemoryGiB: null }),
    )

    expect(assessment.verdict.outcome).toBe("needs-probe")
  })

  it("forced wasm still produces wasm-only (no probe needed)", () => {
    const assessment = assessRuntimeEnablement(
      { device: "wasm" },
      browserObservation({ approxDeviceMemoryGiB: null }),
    )

    expect(assessment.verdict.outcome).toBe("wasm-only")
  })

  it("auto without WebGPU still produces wasm-only (no probe possible)", () => {
    const assessment = assessRuntimeEnablement(
      undefined,
      browserObservation({ hasWebGPU: false, approxDeviceMemoryGiB: null }),
    )

    expect(assessment.verdict.outcome).toBe("wasm-only")
  })

  it("explicit webgpu without WebGPU still produces denied (no probe possible)", () => {
    const assessment = assessRuntimeEnablement(
      { device: "webgpu" },
      browserObservation({ hasWebGPU: false, approxDeviceMemoryGiB: null }),
    )

    expect(assessment.verdict.outcome).toBe("denied")
  })

  it("likely-no-fit still produces wasm-only for auto", () => {
    const assessment = assessRuntimeEnablement(
      undefined,
      browserObservation({ approxDeviceMemoryGiB: 6.5 }),
    )

    expect(assessment.inference?.outcome).toBe("likely-no-fit")
    expect(assessment.verdict.outcome).toBe("wasm-only")
  })

  it("likely-no-fit still produces denied for explicit webgpu", () => {
    const assessment = assessRuntimeEnablement(
      { device: "webgpu" },
      browserObservation({ approxDeviceMemoryGiB: 6.5 }),
    )

    expect(assessment.inference?.outcome).toBe("likely-no-fit")
    expect(assessment.verdict.outcome).toBe("denied")
  })

  it("likely-fit still produces gpu-preferred (no probe needed)", () => {
    const assessment = assessRuntimeEnablement(
      undefined,
      browserObservation({ approxDeviceMemoryGiB: 16 }),
    )

    expect(assessment.inference?.outcome).toBe("likely-fit")
    expect(assessment.verdict.outcome).toBe("gpu-preferred")
  })
})

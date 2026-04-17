import type { Snapshot } from "@babulfish/core"
import { describe, expect, it } from "vitest"

import { enablementText } from "./enablement-text.js"

type ProbeStatus = Snapshot["enablement"]["probe"]["status"]

const BASE: Snapshot = {
  model: { status: "idle" },
  translation: { status: "idle" },
  currentLanguage: null,
  capabilities: {
    ready: true,
    hasWebGPU: true,
    isMobile: false,
    approxDeviceMemoryGiB: 16,
    crossOriginIsolated: true,
  },
  enablement: {
    status: "ready",
    modelProfile: null,
    inference: null,
    probe: { status: "not-run", kind: "adapter-smoke", cache: null, note: "" },
    verdict: {
      outcome: "gpu-preferred",
      resolvedDevice: "webgpu",
      reason: "test",
    },
  },
}

function withProbe(status: ProbeStatus): Snapshot {
  return {
    ...BASE,
    enablement: {
      ...BASE.enablement,
      probe: { status, kind: "adapter-smoke", cache: null, note: "" },
    },
  }
}

describe("enablementText", () => {
  it("omits the probe suffix when probe has not run", () => {
    expect(enablementText(BASE)).toBe("ready / gpu-preferred")
  })

  it("appends probe status when the probe passed", () => {
    expect(enablementText(withProbe("passed"))).toBe("ready / gpu-preferred / probe: passed")
  })

  it("appends probe status while running", () => {
    expect(enablementText(withProbe("running"))).toBe("ready / gpu-preferred / probe: running")
  })

  it("appends probe status when the probe failed", () => {
    expect(enablementText(withProbe("failed"))).toBe("ready / gpu-preferred / probe: failed")
  })
})

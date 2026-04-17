// Minimal WebGPU surface used by the probe — avoids an @webgpu/types dependency.
type ProbeGPU = { requestAdapter(): Promise<ProbeAdapter | null> }
type ProbeAdapter = { features: ReadonlySet<string>; requestDevice(): Promise<ProbeDevice> }
type ProbeDevice = { destroy(): void }

export const PROBE_VERSION = "1"

export type ProbeResult = {
  readonly passed: boolean
  readonly features: readonly string[]
  readonly note: string
  readonly aborted: boolean
}

const ABORTED_RESULT: ProbeResult = Object.freeze({
  passed: false,
  features: [],
  note: "Probe aborted.",
  aborted: true,
})

function getGPU(): ProbeGPU | null {
  if (typeof navigator === "undefined") return null
  return (navigator as Navigator & { gpu?: ProbeGPU }).gpu ?? null
}

export async function runAdapterSmokeProbe(signal?: AbortSignal): Promise<ProbeResult> {
  const gpu = getGPU()
  if (!gpu) {
    return {
      passed: false,
      features: [],
      note: "WebGPU API is not available in this environment.",
      aborted: false,
    }
  }

  if (signal?.aborted) return ABORTED_RESULT

  let adapter: ProbeAdapter | null
  try {
    adapter = await gpu.requestAdapter()
  } catch {
    return {
      passed: false,
      features: [],
      note: "WebGPU adapter request failed.",
      aborted: false,
    }
  }

  if (signal?.aborted) return ABORTED_RESULT

  if (!adapter) {
    return {
      passed: false,
      features: [],
      note: "No WebGPU adapter available.",
      aborted: false,
    }
  }

  const features: string[] = []
  if (adapter.features.has("shader-f16")) {
    features.push("shader-f16")
  }

  let device: ProbeDevice
  try {
    device = await adapter.requestDevice()
  } catch {
    return {
      passed: false,
      features,
      note: "WebGPU device request failed.",
      aborted: false,
    }
  }

  if (signal?.aborted) {
    device.destroy()
    return ABORTED_RESULT
  }

  device.destroy()

  return {
    passed: true,
    features,
    note: features.includes("shader-f16")
      ? "Adapter and device acquired. shader-f16 supported."
      : "Adapter and device acquired.",
    aborted: false,
  }
}

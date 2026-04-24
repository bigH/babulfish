import { afterEach, describe, expect, it, vi } from "vitest"

import type { ResolvedRuntimePlan } from "../../engine/runtime-plan.js"
import { acquireEngine, __resetEngineForTests } from "../engine-handle.js"

const BASE_PLAN: ResolvedRuntimePlan = {
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
  resolvedDevice: "wasm",
  sourceLanguage: "en",
  maxNewTokens: 128,
  subfolder: null,
  modelFileName: null,
}

function plan(overrides: Partial<ResolvedRuntimePlan> = {}): ResolvedRuntimePlan {
  return { ...BASE_PLAN, ...overrides }
}

afterEach(() => {
  __resetEngineForTests()
})

describe("runtime pool", () => {
  it("dedupes the same resolved runtime key", () => {
    const a = acquireEngine(plan())
    const b = acquireEngine(plan())

    expect(a).toBe(b)
    expect(a.id).toBe(b.id)
  })

  it("isolates different max token and source language plans", () => {
    const first = acquireEngine(plan({ resolvedDevice: "webgpu" }))
    const second = acquireEngine(plan({ resolvedDevice: "webgpu", sourceLanguage: "fr" }))
    const third = acquireEngine(plan({ resolvedDevice: "webgpu", maxNewTokens: 64 }))

    expect(second.id).not.toBe(first.id)
    expect(third.id).not.toBe(first.id)
    expect(third.id).not.toBe(second.id)
  })

  it("isolates different adapter and file-location plans", () => {
    const first = acquireEngine(plan())
    const adapter = acquireEngine(plan({ adapterId: "chat" }))
    const subfolder = acquireEngine(plan({ subfolder: "onnx" }))
    const file = acquireEngine(plan({ modelFileName: "model" }))

    expect(adapter.id).not.toBe(first.id)
    expect(subfolder.id).not.toBe(first.id)
    expect(file.id).not.toBe(first.id)
    expect(subfolder.id).not.toBe(file.id)
  })

  it("disposes pooled engines when the reset helper clears the pool", () => {
    const handle = acquireEngine(plan())
    const dispose = vi.spyOn(handle.engine, "dispose")

    __resetEngineForTests()

    expect(dispose).toHaveBeenCalledTimes(1)
  })
})

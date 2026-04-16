import { afterEach, describe, expect, it } from "vitest"

import { acquireEngine, __resetSharedEngine } from "../engine-handle.js"

afterEach(() => {
  __resetSharedEngine()
})

describe("runtime pool", () => {
  it("dedupes the same resolved runtime key", () => {
    const a = acquireEngine({
      modelId: "acme/translator",
      dtype: "q4",
      resolvedDevice: "wasm",
      sourceLanguage: "en",
      maxNewTokens: 128,
    })
    const b = acquireEngine({
      modelId: "acme/translator",
      dtype: "q4",
      resolvedDevice: "wasm",
      sourceLanguage: "en",
      maxNewTokens: 128,
    })

    expect(a).toBe(b)
    expect(a.id).toBe(b.id)
    expect(a.key).toBe("acme/translator|q4|wasm|en|128")
  })

  it("isolates different max token and source language plans", () => {
    const first = acquireEngine({
      modelId: "acme/translator",
      dtype: "q4",
      resolvedDevice: "webgpu",
      sourceLanguage: "en",
      maxNewTokens: 128,
    })
    const second = acquireEngine({
      modelId: "acme/translator",
      dtype: "q4",
      resolvedDevice: "webgpu",
      sourceLanguage: "fr",
      maxNewTokens: 128,
    })
    const third = acquireEngine({
      modelId: "acme/translator",
      dtype: "q4",
      resolvedDevice: "webgpu",
      sourceLanguage: "en",
      maxNewTokens: 64,
    })

    expect(second.id).not.toBe(first.id)
    expect(third.id).not.toBe(first.id)
    expect(third.id).not.toBe(second.id)
  })
})

import type { BabulfishConfig } from "@babulfish/core"
import { describe, expect, it, vi } from "vitest"

import { resolveDemoRuntimeSelection } from "../../demo-shared/src/runtime-selection.js"
import { createVanillaDemoCore, DEMO_ROOTS } from "./runtime-demo.js"

const createdCore = { marker: "demo-core" }
const mockCreateBabulfish = vi.fn((config: unknown) => {
  void config
  return createdCore
})

vi.mock("@babulfish/core", () => ({
  createBabulfish: (config?: unknown) => mockCreateBabulfish(config),
}))

describe("runtime-demo", () => {
  it("passes the shared engine config and demo DOM contract to createBabulfish", () => {
    const selection = resolveDemoRuntimeSelection({
      model: "gemma-3-1b-it",
    }).selection

    expect(createVanillaDemoCore(selection)).toBe(createdCore)

    const firstCall = mockCreateBabulfish.mock.calls[0]
    expect(firstCall).toBeDefined()

    const config = firstCall?.[0] as unknown as BabulfishConfig
    const dom = config.dom

    expect(config.engine).toEqual({
      model: "gemma-3-1b-it",
      dtype: "q4f16",
      device: "webgpu",
    })
    expect(config.engine).not.toHaveProperty("modelId")
    expect(dom?.roots).toEqual(DEMO_ROOTS.map(({ selector }) => selector))
    expect(dom?.structuredText).toEqual({ selector: "[data-structured]" })
    expect(dom?.preserve).toEqual({
      matchers: ["babulfish", "TranslateGemma", "WebGPU"],
    })
    expect(dom?.shouldSkip?.("SKU-123", () => false)).toBe(true)
    expect(dom?.shouldSkip?.("Hello", () => true)).toBe(true)
    expect(dom?.shouldSkip?.("Hello", () => false)).toBe(false)
    expect(
      dom?.outputTransform?.("hola", { kind: "structuredText" } as Parameters<NonNullable<typeof dom.outputTransform>>[1]),
    ).toBe("hola [dom-structured]")
    expect(
      dom?.outputTransform?.("hola", { kind: "text" } as Parameters<NonNullable<typeof dom.outputTransform>>[1]),
    ).toBe("hola")
  })
})

import { describe, expect, it } from "vitest"

import {
  createDemoRuntimeSearchParams,
  createDemoRuntimeSelectionKey,
  getDefaultDemoRuntimeSelection,
  mergeDemoRuntimeSearchParams,
  mergeDemoRuntimeSelection,
  resolveDemoRuntimeSelection,
} from "../../demo-shared/src/runtime-selection.js"

describe("demo runtime selection", () => {
  it("round-trips a supported non-default selection through the URL helpers", () => {
    const resolved = resolveDemoRuntimeSelection({
      device: "wasm",
      modelId: "onnx-community/gemma-3-270m-it-ONNX",
      dtype: "fp32",
      autoload: "1",
    })

    expect(resolved.repairs).toEqual([])

    const params = createDemoRuntimeSearchParams(resolved)
    expect(params.toString()).toBe(
      "device=wasm&modelId=onnx-community%2Fgemma-3-270m-it-ONNX&dtype=fp32&autoload=1",
    )

    const reparsed = resolveDemoRuntimeSelection({
      device: params.get("device"),
      modelId: params.get("modelId"),
      dtype: params.get("dtype"),
      autoload: params.get("autoload"),
    })

    expect(reparsed).toEqual(resolved)
  })

  it("collapses the default selection to an empty query string", () => {
    const defaults = {
      selection: getDefaultDemoRuntimeSelection(),
      autoload: false,
    }

    expect(createDemoRuntimeSearchParams(defaults).toString()).toBe("")
  })

  it("preserves unrelated query params when syncing runtime selection", () => {
    const resolved = resolveDemoRuntimeSelection({
      device: "wasm",
      modelId: "onnx-community/gemma-3-270m-it-ONNX",
      dtype: "fp32",
    })

    const params = mergeDemoRuntimeSearchParams(
      new URLSearchParams("foo=bar&view=debug"),
      resolved,
    )

    expect(params.toString()).toBe(
      "foo=bar&view=debug&device=wasm&modelId=onnx-community%2Fgemma-3-270m-it-ONNX&dtype=fp32",
    )
  })

  it("repairs unknown models back to the default demo catalog", () => {
    const resolved = resolveDemoRuntimeSelection({
      modelId: "acme/not-real",
      device: "webgpu",
      dtype: "q8",
    })

    expect(resolved.selection).toEqual({
      device: "webgpu",
      modelId: "onnx-community/translategemma-text-4b-it-ONNX",
      dtype: "q8",
    })
    expect(resolved.repairs[0]?.code).toBe("unknown-model")
  })

  it("constrains the canary preset to wasm + fp32", () => {
    const resolved = resolveDemoRuntimeSelection({
      modelId: "onnx-community/gemma-3-270m-it-ONNX",
      device: "webgpu",
      dtype: "q4",
    })

    expect(resolved.selection).toEqual({
      device: "wasm",
      modelId: "onnx-community/gemma-3-270m-it-ONNX",
      dtype: "fp32",
    })
    expect(resolved.repairs.map((repair) => repair.code)).toEqual([
      "unsupported-device",
      "unsupported-dtype",
    ])
  })

  it("repairs invalid device and dtype values to the preset defaults", () => {
    const resolved = resolveDemoRuntimeSelection({
      device: "metal",
      modelId: "onnx-community/translategemma-text-4b-it-ONNX",
      dtype: "banana",
    })

    expect(resolved.selection).toEqual(getDefaultDemoRuntimeSelection())
    expect(resolved.repairs.map((repair) => repair.code)).toEqual([
      "invalid-device",
      "invalid-dtype",
    ])
  })

  it("keeps pending selection changes honest when the model change narrows the combo", () => {
    const current = resolveDemoRuntimeSelection({
      device: "webgpu",
      modelId: "onnx-community/translategemma-text-4b-it-ONNX",
      dtype: "q8",
    })

    const next = mergeDemoRuntimeSelection(current, {
      modelId: "onnx-community/gemma-3-270m-it-ONNX",
    })

    expect(next.selection).toEqual({
      device: "wasm",
      modelId: "onnx-community/gemma-3-270m-it-ONNX",
      dtype: "fp32",
    })
    expect(createDemoRuntimeSelectionKey(next.selection)).toBe(
      "onnx-community/gemma-3-270m-it-ONNX|fp32|wasm",
    )
  })
})

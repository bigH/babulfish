import { describe, expect, it } from "vitest"

import {
  createDemoRuntimeSearchParams,
  createDemoRuntimeSelectionKey,
  getDefaultDemoRuntimeSelection,
  mergeDemoRuntimeSearchParams,
  mergeDemoRuntimeSelection,
  resolveDemoRuntimeSelection,
  resolveDemoRuntimeSelectionFromSearchParams,
  toBabulfishEngineConfig,
} from "../../demo-shared/src/runtime-selection.js"

describe("demo runtime selection", () => {
  it("uses canonical model ids in URL params", () => {
    const resolved = resolveDemoRuntimeSelection({
      model: "qwen-3-0.6b",
      autoload: "1",
    })

    expect(resolved.repairs).toEqual([])
    expect(resolved.selection.model).toMatchObject({
      id: "qwen-3-0.6b",
      label: "Qwen 3 0.6B",
      resolvedModelId: "onnx-community/Qwen3-0.6B-ONNX",
      adapterId: "chat",
      subfolder: "onnx",
      modelFileName: "model",
    })
    expect(resolved.selection).toMatchObject({
      device: "webgpu",
      dtype: "q4f16",
      modelId: "onnx-community/Qwen3-0.6B-ONNX",
    })

    const params = createDemoRuntimeSearchParams(resolved)
    expect(params.toString()).toBe("model=qwen-3-0.6b&autoload=1")

    const reparsed = resolveDemoRuntimeSelectionFromSearchParams(params)
    expect(reparsed.selection).toEqual(resolved.selection)
    expect(reparsed.autoload).toBe(true)
  })

  it("reads legacy modelId links when exactly one built-in matches", () => {
    const resolved = resolveDemoRuntimeSelection({
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
    })

    expect(resolved.repairs).toEqual([])
    expect(resolved.selection.model.id).toBe("qwen-2.5-0.5b")
    expect(resolved.selection.model.resolvedModelId).toBe(
      "onnx-community/Qwen2.5-0.5B-Instruct",
    )

    expect(createDemoRuntimeSearchParams(resolved).toString()).toBe(
      "model=qwen-2.5-0.5b",
    )
  })

  it("lets canonical model override disagreeing legacy modelId", () => {
    const resolved = resolveDemoRuntimeSelection({
      model: "qwen-3-0.6b",
      modelId: "onnx-community/Qwen2.5-0.5B-Instruct",
    })

    expect(resolved.selection.model.id).toBe("qwen-3-0.6b")
    expect(resolved.repairs.map((repair) => repair.code)).toEqual([
      "legacy-model-id-ignored",
    ])

    const params = mergeDemoRuntimeSearchParams(
      new URLSearchParams(
        "foo=bar&modelId=onnx-community%2FQwen2.5-0.5B-Instruct&model=qwen-2.5-0.5b",
      ),
      resolved,
    )
    expect(params.toString()).toBe("foo=bar&model=qwen-3-0.6b")
  })

  it("collapses default runtime params and strips legacy modelId while preserving unrelated params", () => {
    const defaults = {
      selection: getDefaultDemoRuntimeSelection(),
      autoload: false,
    }

    expect(createDemoRuntimeSearchParams(defaults).toString()).toBe("")

    const params = mergeDemoRuntimeSearchParams(
      new URLSearchParams(
        "foo=bar&model=qwen-3-0.6b&modelId=onnx-community%2FQwen3-0.6B-ONNX&device=webgpu&dtype=q4f16&autoload=1",
      ),
      defaults,
    )

    expect(params.toString()).toBe("foo=bar")
  })

  it("repairs unsupported dtype and device values to the selected model defaults", () => {
    const resolved = resolveDemoRuntimeSelection({
      model: "qwen-3-0.6b",
      device: "wasm",
      dtype: "fp32",
    })

    expect(resolved.selection).toMatchObject({
      device: "webgpu",
      dtype: "q4f16",
    })
    expect(resolved.repairs.map((repair) => repair.code)).toEqual([
      "unsupported-device",
      "unsupported-dtype",
    ])
  })

  it("repairs invalid dtype and device values to the selected model defaults", () => {
    const resolved = resolveDemoRuntimeSelection({
      model: "translategemma-4",
      device: "metal",
      dtype: "banana",
    })

    expect(resolved.selection).toEqual(getDefaultDemoRuntimeSelection())
    expect(resolved.repairs.map((repair) => repair.code)).toEqual([
      "invalid-device",
      "invalid-dtype",
    ])
  })

  it("includes model spec, resolved model, adapter, dtype, and device in runtime keys", () => {
    const selection = resolveDemoRuntimeSelection({ model: "qwen-3-0.6b" }).selection
    const key = createDemoRuntimeSelectionKey(selection)

    expect(key).toBe(
      "model:qwen-3-0.6b|resolved:onnx-community/Qwen3-0.6B-ONNX|adapter:chat|dtype:q4f16|device:webgpu",
    )

    expect(
      createDemoRuntimeSelectionKey({
        ...selection,
        model: {
          ...selection.model,
          adapterId: "other-adapter",
        },
      }),
    ).not.toBe(key)
  })

  it("builds adapter-aware core engine config from the shared selection", () => {
    const selection = resolveDemoRuntimeSelection({ model: "gemma-3-1b-it" }).selection
    const config = toBabulfishEngineConfig(selection)

    expect(config).toEqual({
      model: "gemma-3-1b-it",
      dtype: "q4f16",
      device: "webgpu",
    })
    expect(config).not.toHaveProperty("modelId")
  })

  it("keeps merge patches compatible with canonical model and legacy modelId inputs", () => {
    const current = resolveDemoRuntimeSelection({
      model: "translategemma-4",
      device: "webgpu",
      dtype: "q8",
    })

    expect(mergeDemoRuntimeSelection(current, { model: "qwen-3-0.6b" }).selection).toMatchObject({
      device: "webgpu",
      dtype: "q4f16",
      model: { id: "qwen-3-0.6b" },
    })
    expect(
      mergeDemoRuntimeSelection(current, {
        modelId: "onnx-community/gemma-3-1b-it-ONNX",
      }).selection,
    ).toMatchObject({
      device: "webgpu",
      dtype: "q4f16",
      model: { id: "gemma-3-1b-it" },
    })
  })
})

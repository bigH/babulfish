import { render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveDemoRuntimeSelectionFromSearchParams } from "../../demo-shared/src/runtime-selection.js"

const capturedInitialRuntimeStates: unknown[] = []

vi.mock("./demo-translator-shell", () => ({
  DemoTranslatorShell: ({
    initialRuntimeState,
    children,
  }: {
    initialRuntimeState: unknown
    children: ReactNode
  }) => {
    capturedInitialRuntimeStates.push(initialRuntimeState)
    return <div data-testid="demo-translator-shell">{children}</div>
  },
}))

vi.mock("./model-status", () => ({
  ModelStatus: () => <div data-testid="model-status" />,
}))

import Home from "./page"

describe("Home", () => {
  beforeEach(() => {
    capturedInitialRuntimeStates.length = 0
  })

  it("derives the initial runtime state from canonical model search params", async () => {
    const searchParams = {
      foo: "bar",
      model: [
        "qwen-3-0.6b",
        "qwen-2.5-0.5b",
      ],
      modelId: [
        "onnx-community/Qwen2.5-0.5B-Instruct",
        "onnx-community/gemma-3-1b-it-ONNX",
      ],
      device: "webgpu",
      dtype: "q4f16",
    }

    const page = await Home({ searchParams: Promise.resolve(searchParams) })

    render(page)

    expect(screen.getByTestId("demo-translator-shell")).toBeTruthy()
    expect(screen.getByTestId("model-status")).toBeTruthy()
    expect(capturedInitialRuntimeStates).toEqual([
      resolveDemoRuntimeSelectionFromSearchParams(
        new URLSearchParams([
          ["foo", "bar"],
          ["model", "qwen-3-0.6b"],
          ["model", "qwen-2.5-0.5b"],
          ["modelId", "onnx-community/Qwen2.5-0.5B-Instruct"],
          ["modelId", "onnx-community/gemma-3-1b-it-ONNX"],
          ["device", "webgpu"],
          ["dtype", "q4f16"],
        ]),
      ),
    ])
  })
})

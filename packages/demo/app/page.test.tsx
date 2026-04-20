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

  it("derives the initial runtime state from the shared search-param resolver", async () => {
    const searchParams = {
      foo: "bar",
      modelId: [
        "acme/not-real",
        "onnx-community/gemma-3-270m-it-ONNX",
      ],
      device: "webgpu",
      dtype: "q8",
    }

    const page = await Home({ searchParams: Promise.resolve(searchParams) })

    render(page)

    expect(screen.getByTestId("demo-translator-shell")).toBeTruthy()
    expect(screen.getByTestId("model-status")).toBeTruthy()
    expect(capturedInitialRuntimeStates).toEqual([
      resolveDemoRuntimeSelectionFromSearchParams(
        new URLSearchParams([
          ["foo", "bar"],
          ["modelId", "acme/not-real"],
          ["modelId", "onnx-community/gemma-3-270m-it-ONNX"],
          ["device", "webgpu"],
          ["dtype", "q8"],
        ]),
      ),
    ])
  })
})

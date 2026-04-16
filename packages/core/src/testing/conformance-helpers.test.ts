import { describe, expect, it } from "vitest"

import {
  makeControllablePipeline,
  makeFakePipeline,
} from "./conformance-helpers.js"

describe("conformance helpers", () => {
  it("makeFakePipeline returns the requested translation", async () => {
    const pipeline = makeFakePipeline("hola")

    await expect(pipeline()).resolves.toEqual([
      { generated_text: [{ role: "assistant", content: "hola" }] },
    ])
    await expect(pipeline.dispose()).resolves.toBeUndefined()
  })

  it("makeControllablePipeline waits for release before resolving", async () => {
    const controlled = makeControllablePipeline("hola")
    let settled = false
    const translation = controlled.pipeline().then((value) => {
      settled = true
      return value
    })

    await controlled.waitForStart()
    await Promise.resolve()
    expect(settled).toBe(false)

    controlled.release()

    await expect(translation).resolves.toEqual([
      { generated_text: [{ role: "assistant", content: "hola" }] },
    ])
    await expect(controlled.pipeline.dispose()).resolves.toBeUndefined()
  })
})

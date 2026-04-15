import { describe, expect, it } from "vitest"

import { createProgressController } from "../progress.js"

function expectAbortError(signal: AbortSignal, expectedMessage: string): void {
  expect(signal.aborted).toBe(true)
  expect(signal.reason).toBeInstanceOf(DOMException)
  expect((signal.reason as DOMException).name).toBe("AbortError")
  expect((signal.reason as DOMException).message).toBe(expectedMessage)
}

describe("createProgressController", () => {
  it("aborts the previous run when a new run starts", () => {
    const progress = createProgressController()

    const firstRun = progress.startRun()
    const secondRun = progress.startRun()

    expectAbortError(firstRun.signal, "Superseded by new translation")
    expect(progress.isCurrentRun(firstRun.runId)).toBe(false)
    expect(progress.isCurrentRun(secondRun.runId)).toBe(true)
  })

  it("aborts the active run without clearing its run identity", () => {
    const progress = createProgressController()

    const run = progress.startRun()
    progress.abortCurrent()

    expectAbortError(run.signal, "Translation aborted")
    expect(progress.isCurrentRun(run.runId)).toBe(true)
  })

  it("aborts the active run on dispose", () => {
    const progress = createProgressController()

    const run = progress.startRun()
    progress.dispose()

    expectAbortError(run.signal, "Core disposed")
    expect(progress.isCurrentRun(run.runId)).toBe(true)
  })
})

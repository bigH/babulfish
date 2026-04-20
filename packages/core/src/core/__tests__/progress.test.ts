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
    expect(firstRun.isCurrent()).toBe(false)
    expect(secondRun.isCurrent()).toBe(true)
  })

  it("aborts the active run without clearing its run identity", () => {
    const progress = createProgressController()

    const run = progress.startRun()
    progress.abortCurrent()

    expectAbortError(run.signal, "Translation aborted")
    expect(run.isCurrent()).toBe(true)
  })

  it("marks an aborted run as stale once a newer run starts", () => {
    const progress = createProgressController()

    const firstRun = progress.startRun()
    progress.abortCurrent()
    const secondRun = progress.startRun()

    expect(firstRun.isCurrent()).toBe(false)
    expect(secondRun.isCurrent()).toBe(true)
  })

  it("aborts the active run on dispose", () => {
    const progress = createProgressController()

    const run = progress.startRun()
    progress.dispose()

    expectAbortError(run.signal, "Core disposed")
    expect(run.isCurrent()).toBe(true)
  })
})

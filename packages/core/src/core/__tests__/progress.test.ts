import { describe, expect, it } from "vitest"

import { createProgressController } from "../progress.js"

describe("createProgressController", () => {
  it("aborts the previous run when a new run starts", () => {
    const progress = createProgressController()

    const firstRun = progress.startRun()
    const secondRun = progress.startRun()

    expect(firstRun.signal.aborted).toBe(true)
    expect(firstRun.signal.reason).toBeInstanceOf(DOMException)
    expect((firstRun.signal.reason as DOMException).name).toBe("AbortError")
    expect((firstRun.signal.reason as DOMException).message).toBe(
      "Superseded by new translation",
    )
    expect(progress.isCurrentRun(firstRun.runId)).toBe(false)
    expect(progress.isCurrentRun(secondRun.runId)).toBe(true)
  })

  it("aborts the active run without clearing its run identity", () => {
    const progress = createProgressController()

    const run = progress.startRun()
    progress.abortCurrent()

    expect(run.signal.aborted).toBe(true)
    expect(run.signal.reason).toBeInstanceOf(DOMException)
    expect((run.signal.reason as DOMException).name).toBe("AbortError")
    expect((run.signal.reason as DOMException).message).toBe("Translation aborted")
    expect(progress.isCurrentRun(run.runId)).toBe(true)
  })

  it("aborts the active run on dispose", () => {
    const progress = createProgressController()

    const run = progress.startRun()
    progress.dispose()

    expect(run.signal.aborted).toBe(true)
    expect(run.signal.reason).toBeInstanceOf(DOMException)
    expect((run.signal.reason as DOMException).name).toBe("AbortError")
    expect((run.signal.reason as DOMException).message).toBe("Core disposed")
    expect(progress.isCurrentRun(run.runId)).toBe(true)
  })
})

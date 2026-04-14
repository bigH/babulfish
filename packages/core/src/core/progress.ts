export type ProgressRun = {
  readonly runId: number
  readonly signal: AbortSignal
}

export type ProgressController = {
  startRun(): ProgressRun
  isCurrentRun(runId: number): boolean
  abortCurrent(): void
  dispose(): void
}

export function createProgressController(): ProgressController {
  let currentRunId = 0
  let currentController: AbortController | null = null

  function abortCurrentWith(message: string): void {
    currentController?.abort(new DOMException(message, "AbortError"))
    currentController = null
  }

  return {
    startRun() {
      abortCurrentWith("Superseded by new translation")
      currentRunId++
      const controller = new AbortController()
      currentController = controller

      return { runId: currentRunId, signal: controller.signal }
    },
    isCurrentRun(runId: number) {
      return currentRunId === runId
    },
    abortCurrent() {
      abortCurrentWith("Translation aborted")
    },
    dispose() {
      abortCurrentWith("Core disposed")
    },
  }
}

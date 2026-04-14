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

  return {
    startRun() {
      currentController?.abort(
        new DOMException("Superseded by new translation", "AbortError"),
      )

      currentRunId++
      const controller = new AbortController()
      currentController = controller

      return { runId: currentRunId, signal: controller.signal }
    },
    isCurrentRun(runId: number) {
      return currentRunId === runId
    },
    abortCurrent() {
      currentController?.abort(
        new DOMException("Translation aborted", "AbortError"),
      )
      currentController = null
    },
    dispose() {
      currentController?.abort(
        new DOMException("Core disposed", "AbortError"),
      )
      currentController = null
    },
  }
}

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

const abortReasons = {
  superseded: "Superseded by new translation",
  aborted: "Translation aborted",
  disposed: "Core disposed",
} as const

export function createProgressController(): ProgressController {
  let currentRunId = 0
  let currentController: AbortController | null = null

  function abortCurrentWith(message: (typeof abortReasons)[keyof typeof abortReasons]): void {
    currentController?.abort(new DOMException(message, "AbortError"))
    currentController = null
  }

  return {
    startRun() {
      abortCurrentWith(abortReasons.superseded)
      currentRunId++
      const controller = new AbortController()
      currentController = controller

      return { runId: currentRunId, signal: controller.signal }
    },
    isCurrentRun(runId: number) {
      return currentRunId === runId
    },
    abortCurrent() {
      abortCurrentWith(abortReasons.aborted)
    },
    dispose() {
      abortCurrentWith(abortReasons.disposed)
    },
  }
}

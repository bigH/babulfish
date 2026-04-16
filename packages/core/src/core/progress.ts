type ProgressRun = {
  readonly signal: AbortSignal
  isCurrent(): boolean
}

type ProgressController = {
  startRun(): ProgressRun
  abortCurrent(): void
  dispose(): void
}

export function createProgressController(): ProgressController {
  let currentController: AbortController | null = null
  let currentRun: ProgressRun | null = null

  function abortCurrentWith(message: string): void {
    currentController?.abort(new DOMException(message, "AbortError"))
    currentController = null
  }

  return {
    startRun() {
      abortCurrentWith("Superseded by new translation")
      const controller = new AbortController()
      const run: ProgressRun = {
        signal: controller.signal,
        isCurrent: () => currentRun === run,
      }
      currentController = controller
      currentRun = run
      return run
    },
    abortCurrent() {
      abortCurrentWith("Translation aborted")
    },
    dispose() {
      abortCurrentWith("Core disposed")
    },
  }
}

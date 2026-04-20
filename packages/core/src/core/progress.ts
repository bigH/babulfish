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
  let activeController: AbortController | null = null
  let currentGeneration = 0

  function abortCurrentWith(message: string): void {
    activeController?.abort(new DOMException(message, "AbortError"))
    activeController = null
  }

  return {
    startRun() {
      abortCurrentWith("Superseded by new translation")
      const controller = new AbortController()
      const generation = ++currentGeneration
      const run: ProgressRun = {
        signal: controller.signal,
        isCurrent: () => currentGeneration === generation,
      }
      activeController = controller
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

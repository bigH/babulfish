import { useSyncExternalStore } from "react"
import { useTranslatorContext } from "./context.js"
import { SSR_SNAPSHOT } from "./ssr.js"

export type UseTranslateDOMReturn = {
  translatePage(lang: string): Promise<void>
  restorePage(): void
  readonly progress: number | null
}

export function useTranslateDOM(): UseTranslateDOMReturn {
  const core = useTranslatorContext()
  const snapshot = useSyncExternalStore(
    core.subscribe,
    () => core.snapshot,
    () => SSR_SNAPSHOT,
  )

  const progress =
    snapshot.translation.status === "translating"
      ? snapshot.translation.progress
      : null

  return { translatePage: core.translateTo, restorePage: core.restore, progress }
}

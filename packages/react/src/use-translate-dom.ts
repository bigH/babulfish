import { useTranslatorContext, useTranslatorSnapshot } from "./context.js"

type UseTranslateDOMReturn = {
  translatePage(lang: string): Promise<void>
  restorePage(): void
  readonly progress: number | null
}

export function useTranslateDOM(): UseTranslateDOMReturn {
  const core = useTranslatorContext()
  const snapshot = useTranslatorSnapshot(core)

  const progress =
    snapshot.translation.status === "translating"
      ? snapshot.translation.progress
      : null

  return { translatePage: core.translateTo, restorePage: core.restore, progress }
}

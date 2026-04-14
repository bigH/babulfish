// useTranslateDOM — thin wrapper around the DOM translator for consumers
// who build their own UI and skip TranslateButton

import { useCallback } from "react"
import { useTranslatorContext } from "./context.js"

export type UseTranslateDOMReturn = {
  translatePage(lang: string): Promise<void>
  restorePage(): void
  readonly progress: number | null
}

export function useTranslateDOM(): UseTranslateDOMReturn {
  const { domTranslator, translationProgress } = useTranslatorContext()

  const translatePage = useCallback(
    async (lang: string) => {
      if (!domTranslator) return

      await domTranslator.translate(lang)
    },
    [domTranslator],
  )

  const restorePage = useCallback(() => {
    domTranslator?.restore()
  }, [domTranslator])

  return { translatePage, restorePage, progress: translationProgress }
}

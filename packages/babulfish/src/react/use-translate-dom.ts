// useTranslateDOM — thin wrapper around the DOM translator for consumers
// who build their own UI and skip TranslateButton

import { useCallback, useState } from "react"
import { useBabulfishContext } from "./context.js"

export type UseTranslateDOMReturn = {
  translatePage(lang: string): Promise<void>
  restorePage(): void
  readonly progress: number | null
}

export function useTranslateDOM(): UseTranslateDOMReturn {
  const { domTranslator } = useBabulfishContext()
  const [progress, setProgress] = useState<number | null>(null)

  const translatePage = useCallback(
    async (lang: string) => {
      if (!domTranslator) return

      setProgress(0)
      try {
        await domTranslator.translate(lang)
      } finally {
        setProgress(null)
      }
    },
    [domTranslator],
  )

  const restorePage = useCallback(() => {
    domTranslator?.restore()
    setProgress(null)
  }, [domTranslator])

  return { translatePage, restorePage, progress }
}

import { useTranslator } from "./use-translator.js"

type UseTranslateDOMReturn = {
  translatePage(lang: string): Promise<void>
  restorePage(): void
  readonly progress: number | null
}

export function useTranslateDOM(): UseTranslateDOMReturn {
  const { translateTo, restore, translation } = useTranslator()
  const progress =
    translation.status === "translating" ? translation.progress : null

  return { translatePage: translateTo, restorePage: restore, progress }
}

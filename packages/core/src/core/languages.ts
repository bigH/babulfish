export type Language = { readonly label: string; readonly code: string }

export function freezeLanguages(languages: readonly Language[]): ReadonlyArray<Language> {
  return Object.freeze(languages.map((language) => Object.freeze({ ...language })))
}

export const DEFAULT_LANGUAGES: ReadonlyArray<Language> = freezeLanguages([
  { label: "Spanish", code: "es-ES" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Japanese", code: "ja" },
  { label: "Korean", code: "ko" },
  { label: "Chinese (Simplified)", code: "zh-CN" },
  { label: "Hindi", code: "hi" },
  { label: "Portuguese (Brazil)", code: "pt-BR" },
  { label: "Arabic", code: "ar" },
  { label: "Russian", code: "ru" },
  { label: "Italian", code: "it" },
  { label: "Thai", code: "th" },
  { label: "Vietnamese", code: "vi" },
])

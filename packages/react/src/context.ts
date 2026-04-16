import { createContext, useContext, useSyncExternalStore } from "react"
import type { BabulfishCore, Snapshot } from "@babulfish/core"
import { SSR_CORE } from "./ssr.js"

const MISSING_PROVIDER_ERROR =
  "Translator hooks must be used within <TranslatorProvider>"

export const TranslatorContext = createContext<BabulfishCore | null>(null)

export function useTranslatorContext(): BabulfishCore {
  const ctx = useContext(TranslatorContext)
  if (!ctx) {
    throw new Error(MISSING_PROVIDER_ERROR)
  }
  return ctx
}

export function useTranslatorSnapshot(core: BabulfishCore): Snapshot {
  return useSyncExternalStore(
    core.subscribe,
    () => core.snapshot,
    () => SSR_CORE.snapshot,
  )
}

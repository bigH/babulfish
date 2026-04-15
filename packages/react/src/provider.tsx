import { useEffect, useRef, type ReactNode } from "react"
import { createBabulfish } from "@babulfish/core"
import type { BabulfishConfig, BabulfishCore } from "@babulfish/core"
import { TranslatorContext } from "./context.js"
import { SSR_CORE } from "./ssr.js"

export type TranslatorConfig = BabulfishConfig

export type { Language as TranslatorLanguage } from "@babulfish/core"

export function TranslatorProvider({
  config,
  children,
}: {
  config?: TranslatorConfig
  children: ReactNode
}) {
  const coreRef = useRef<BabulfishCore | null>(null)
  if (typeof document !== "undefined" && !coreRef.current) {
    coreRef.current = createBabulfish(config)
  }
  const core = coreRef.current ?? SSR_CORE

  useEffect(() => {
    return () => {
      coreRef.current?.dispose()
    }
  }, [])

  return (
    <TranslatorContext.Provider value={core}>
      {children}
    </TranslatorContext.Provider>
  )
}

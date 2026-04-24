import { useEffect, useRef, useState, type ReactNode } from "react"
import { createBabulfish } from "@babulfish/core"
import type { BabulfishConfig, BabulfishCore } from "@babulfish/core"
import { TranslatorContext } from "./context.js"
import { SSR_CORE } from "./ssr.js"

export function TranslatorProvider({
  config,
  children,
}: {
  config?: BabulfishConfig
  children: ReactNode
}) {
  const [core] = useState<BabulfishCore>(() => {
    if (typeof document === "undefined") {
      return SSR_CORE
    }
    return createBabulfish(config)
  })
  const disposeTimerRef = useRef<ReturnType<typeof globalThis.setTimeout> | null>(null)

  useEffect(() => {
    if (disposeTimerRef.current !== null) {
      globalThis.clearTimeout(disposeTimerRef.current)
      disposeTimerRef.current = null
    }

    return () => {
      core.abort()
      disposeTimerRef.current = globalThis.setTimeout(() => {
        disposeTimerRef.current = null
        try {
          void Promise.resolve(core.dispose()).catch(() => {})
        } catch {
          // Dispose is best-effort during React cleanup.
        }
      }, 0)
    }
  }, [core])

  return (
    <TranslatorContext.Provider value={core}>
      {children}
    </TranslatorContext.Provider>
  )
}

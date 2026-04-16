import { useEffect, useState, type ReactNode } from "react"
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

  useEffect(() => {
    return () => {
      core.dispose()
    }
  }, [core])

  return (
    <TranslatorContext.Provider value={core}>
      {children}
    </TranslatorContext.Provider>
  )
}

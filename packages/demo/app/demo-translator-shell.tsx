"use client"

import type { ReactNode } from "react"
import { TranslatorProvider, TranslateButton } from "@babulfish/react"
import type { TranslatorConfig } from "@babulfish/react"

const DEMO_TRANSLATION_ROOTS = ["main"] as const
const DEMO_PRESERVED_TERMS = [
  "babulfish",
  "Next.js",
  "TranslateGemma",
  "WebGPU",
] as const

const DEMO_TRANSLATOR_CONFIG: TranslatorConfig = {
  dom: {
    roots: [...DEMO_TRANSLATION_ROOTS],
    preserve: {
      matchers: [...DEMO_PRESERVED_TERMS],
    },
  },
}

export function DemoTranslatorShell({ children }: { children: ReactNode }) {
  return (
    <TranslatorProvider config={DEMO_TRANSLATOR_CONFIG}>
      {children}
      <div className="fixed right-4 top-4 z-50">
        <TranslateButton />
      </div>
    </TranslatorProvider>
  )
}

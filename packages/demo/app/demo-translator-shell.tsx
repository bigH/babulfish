"use client"

import type { ReactNode } from "react"
import { useEffect, useState } from "react"
import { TranslateButton, TranslatorProvider } from "@babulfish/react"

import {
  mergeDemoRuntimeSearchParams,
  createDemoRuntimeSelectionKey,
  mergeDemoRuntimeSelection,
  toEngineSelection,
  type DemoRuntimeSelection,
  type ResolvedDemoRuntimeSelection,
} from "../../demo-shared/src/runtime-selection.js"
import {
  RuntimeSelectionProvider,
} from "./runtime-selection-context"

const DEMO_DOM_CONFIG = {
  roots: ["[data-demo-root]"],
  preserve: {
    matchers: ["babulfish", "Next.js", "TranslateGemma", "WebGPU"],
  },
}

export function DemoTranslatorShell({
  initialRuntimeState,
  children,
}: {
  initialRuntimeState: ResolvedDemoRuntimeSelection
  children: ReactNode
}) {
  const [runtimeState, setRuntimeState] = useState(initialRuntimeState)

  useEffect(() => {
    const params = mergeDemoRuntimeSearchParams(
      new URLSearchParams(window.location.search),
      runtimeState,
    )
    const nextSearch = params.toString()
    const nextUrl =
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ""}${window.location.hash}`
    window.history.replaceState(null, "", nextUrl)
  }, [runtimeState])

  useEffect(() => {
    setRuntimeState(initialRuntimeState)
  }, [initialRuntimeState])

  const providerConfig = {
    engine: toEngineSelection(runtimeState.selection),
    dom: DEMO_DOM_CONFIG,
  }

  return (
    <RuntimeSelectionProvider
      value={{
        runtimeState,
        updateRuntimeSelection: (patch: Partial<DemoRuntimeSelection>) => {
          setRuntimeState((current) => mergeDemoRuntimeSelection(current, patch))
        },
      }}
    >
      <TranslatorProvider
        key={createDemoRuntimeSelectionKey(runtimeState.selection)}
        config={providerConfig}
      >
        {children}
        <div className="fixed right-4 top-4 z-50">
          <TranslateButton />
        </div>
      </TranslatorProvider>
    </RuntimeSelectionProvider>
  )
}

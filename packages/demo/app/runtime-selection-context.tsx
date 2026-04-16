"use client"

import { createContext, useContext } from "react"

import type {
  DemoRuntimeSelection,
  ResolvedDemoRuntimeSelection,
} from "../../demo-shared/src/runtime-selection.js"

export type RuntimeSelectionContextValue = {
  readonly runtimeState: ResolvedDemoRuntimeSelection
  updateRuntimeSelection: (patch: Partial<DemoRuntimeSelection>) => void
}

const RuntimeSelectionContext = createContext<RuntimeSelectionContextValue | null>(null)

export const RuntimeSelectionProvider = RuntimeSelectionContext.Provider

export function useRuntimeSelectionContext(): RuntimeSelectionContextValue {
  const value = useContext(RuntimeSelectionContext)
  if (value === null) {
    throw new Error("Runtime selection hooks must be used within <RuntimeSelectionProvider>")
  }
  return value
}

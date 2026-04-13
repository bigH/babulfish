import { createEngine, type EngineConfig } from "babulfish/engine"

export const engineConfig: EngineConfig = {
  device: "wasm",
  sourceLanguage: "en",
}

export function createStandaloneEngine() {
  return createEngine(engineConfig)
}

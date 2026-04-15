import type { EngineConfig, Translator } from "../engine/model.js"
import { createEngine } from "../engine/model.js"

export type EngineHandle = {
  readonly engine: Translator
  readonly id: symbol
}

type SharedEngineHandle = {
  readonly engine: Translator
  readonly id: symbol
}

let sharedEngine: SharedEngineHandle | null = null

const coreEngineMap = new WeakMap<object, symbol>()

export function acquireEngine(config?: EngineConfig): EngineHandle {
  if (!sharedEngine) {
    sharedEngine = {
      engine: createEngine(config),
      id: Symbol("engine"),
    }
  }
  return sharedEngine
}

export function registerCoreEngine(core: object, id: symbol): void {
  coreEngineMap.set(core, id)
}

export function getEngineIdentityForCore(core: object): symbol | undefined {
  return coreEngineMap.get(core)
}

export function __resetSharedEngine(): void {
  sharedEngine?.engine.dispose()
  sharedEngine = null
}

import type { EngineConfig, Translator } from "../engine/model.js"
import { createEngine } from "../engine/model.js"

export type EngineHandle = {
  readonly engine: Translator
  readonly id: symbol
}

let sharedEngine: Translator | null = null
let sharedEngineId: symbol | null = null

const coreEngineMap = new WeakMap<object, symbol>()

export function acquireEngine(config?: EngineConfig): EngineHandle {
  if (!sharedEngine) {
    sharedEngine = createEngine(config)
    sharedEngineId = Symbol("engine")
  }
  return { engine: sharedEngine, id: sharedEngineId! }
}

export function registerCoreEngine(core: object, id: symbol): void {
  coreEngineMap.set(core, id)
}

export function getEngineIdentityForCore(core: object): symbol | undefined {
  return coreEngineMap.get(core)
}

export function __resetSharedEngine(): void {
  if (sharedEngine) {
    sharedEngine.dispose()
  }
  sharedEngine = null
  sharedEngineId = null
}

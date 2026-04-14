import type { EngineConfig, Translator } from "../engine/index.js"
import { createEngine } from "../engine/index.js"

export type EngineHandle = {
  readonly engine: Translator
  readonly id: symbol
}

let sharedEngine: Translator | null = null
let sharedEngineId: symbol | null = null
let refCount = 0

const coreEngineMap = new WeakMap<object, symbol>()

export function acquireEngine(config?: EngineConfig): EngineHandle {
  if (!sharedEngine) {
    sharedEngine = createEngine(config)
    sharedEngineId = Symbol("engine")
  }
  refCount++
  return { engine: sharedEngine, id: sharedEngineId! }
}

export function releaseEngine(_handle: EngineHandle): void {
  refCount = Math.max(0, refCount - 1)
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
  refCount = 0
}

export function __getRefCount(): number {
  return refCount
}

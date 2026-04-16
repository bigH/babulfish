import type { EngineConfig, Translator } from "../engine/model.js"
import { createEngine } from "../engine/model.js"

export type EngineHandle = {
  readonly engine: Translator
  readonly id: symbol
}

const coreEngineIdentity = Symbol("core-engine-identity")

type EngineIdentityCarrier = {
  readonly [coreEngineIdentity]?: symbol
}

let sharedEngine: EngineHandle | null = null

export function acquireEngine(config?: EngineConfig): EngineHandle {
  if (!sharedEngine) {
    sharedEngine = {
      engine: createEngine(config),
      id: Symbol("engine"),
    }
  }
  return sharedEngine
}

export function tagCoreWithEngineIdentity(core: object, id: symbol): void {
  Object.defineProperty(core as EngineIdentityCarrier, coreEngineIdentity, {
    value: id,
    enumerable: false,
    writable: false,
    configurable: false,
  })
}

export function getEngineIdentityForCore(core: object): symbol | undefined {
  return (core as EngineIdentityCarrier)[coreEngineIdentity]
}

export function __resetSharedEngine(): void {
  sharedEngine?.engine.dispose()
  sharedEngine = null
}

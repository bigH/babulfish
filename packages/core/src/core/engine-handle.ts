import type { ResolvedRuntimePlan } from "../engine/runtime-plan.js"
import type { Translator } from "../engine/model.js"
import { createEngine } from "../engine/model.js"
import { createRuntimePlanKey } from "../engine/runtime-plan.js"

export type EngineHandle = {
  readonly engine: Translator
  readonly id: symbol
  readonly key: string
}

const coreEngineIdentity = Symbol("core-engine-identity")

type EngineIdentityCarrier = {
  readonly [coreEngineIdentity]?: symbol
}

const runtimePool = new Map<string, EngineHandle>()

export function acquireEngine(plan: ResolvedRuntimePlan): EngineHandle {
  const key = createRuntimePlanKey(plan)
  const existing = runtimePool.get(key)
  if (existing) {
    return existing
  }

  const handle = {
    engine: createEngine({
      modelId: plan.modelId,
      dtype: plan.dtype,
      device: plan.resolvedDevice,
      sourceLanguage: plan.sourceLanguage,
      maxNewTokens: plan.maxNewTokens,
    }),
    id: Symbol("engine"),
    key,
  } satisfies EngineHandle

  runtimePool.set(key, handle)
  return handle
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
  for (const handle of runtimePool.values()) {
    handle.engine.dispose()
  }
  runtimePool.clear()
}

import { createEngine } from "../engine/model.js"
import { createRuntimePlanKey, type ResolvedRuntimePlan } from "../engine/runtime-plan.js"

type EngineHandle = {
  readonly engine: ReturnType<typeof createEngine>
  readonly id: symbol
}

const coreEngineIdentity = new WeakMap<object, symbol>()

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
  } satisfies EngineHandle

  runtimePool.set(key, handle)
  return handle
}

export function tagCoreWithEngineIdentity(core: object, id: symbol): void {
  coreEngineIdentity.set(core, id)
}

export function getEngineIdentity(core: object): symbol | undefined {
  return coreEngineIdentity.get(core)
}

export function __resetEngineForTests(): void {
  for (const handle of runtimePool.values()) {
    handle.engine.dispose()
  }
  runtimePool.clear()
}

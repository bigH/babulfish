import { createEngine, type EngineConfig } from "../engine/model.js"
import { createRuntimePlanKey, type ResolvedRuntimePlan } from "../engine/runtime-plan.js"
import type { RuntimePreferenceConfig } from "../engine/runtime-plan.js"

type EngineHandle = {
  readonly engine: ReturnType<typeof createEngine>
  readonly id: symbol
}

const coreEngineIdentity = new WeakMap<object, symbol>()

const runtimePool = new Map<string, EngineHandle>()

function createEngineConfig(
  plan: ResolvedRuntimePlan,
  requestedConfig?: RuntimePreferenceConfig,
): EngineConfig {
  return {
    ...requestedConfig,
    ...(requestedConfig?.model === undefined ? { modelId: plan.modelId } : {}),
    dtype: plan.dtype,
    device: plan.resolvedDevice,
    sourceLanguage: plan.sourceLanguage,
    maxNewTokens: plan.maxNewTokens,
  }
}

export function acquireEngine(
  plan: ResolvedRuntimePlan,
  requestedConfig?: RuntimePreferenceConfig,
): EngineHandle {
  const key = createRuntimePlanKey(plan)
  const existing = runtimePool.get(key)
  if (existing) {
    return existing
  }

  const handle = {
    engine: createEngine(createEngineConfig(plan, requestedConfig)),
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

/**
 * @experimental — test-only; subject to change
 */

import type { BabulfishCore } from "../../core/babulfish.js"
import { __resetSharedEngine, getEngineIdentityForCore } from "../../core/engine-handle.js"

export function __resetEngineForTests(): void {
  __resetSharedEngine()
}

export function getEngineIdentity(core: BabulfishCore): symbol | undefined {
  return getEngineIdentityForCore(core)
}

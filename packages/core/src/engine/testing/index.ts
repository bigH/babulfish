/** @experimental — test-only; subject to change */
export {
  __resetAssessmentCache as __resetEnablementAssessmentForTests,
} from "../runtime-plan.js"
export {
  __resetSharedEngine as __resetEngineForTests,
  getEngineIdentityForCore as getEngineIdentity,
} from "../../core/engine-handle.js"
export {
  __resetProbeCacheForTests,
} from "../probe-cache.js"

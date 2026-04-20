import { describe, expect, it } from "vitest"

import { __resetEngineForTests, getEngineIdentity } from "../../core/engine-handle.js"
import {
  __resetEnablementAssessmentForTests,
} from "../runtime-plan.js"
import { __resetProbeCacheForTests } from "../probe-cache.js"
import * as testingExports from "../testing/index.js"

describe("engine/testing public exports", () => {
  it("re-exports the underlying test helpers without wrapper aliases", () => {
    expect(testingExports.__resetEngineForTests).toBe(__resetEngineForTests)
    expect(testingExports.getEngineIdentity).toBe(getEngineIdentity)
    expect(testingExports.__resetEnablementAssessmentForTests).toBe(
      __resetEnablementAssessmentForTests,
    )
    expect(testingExports.__resetProbeCacheForTests).toBe(__resetProbeCacheForTests)
  })
})

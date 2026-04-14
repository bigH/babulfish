import { describe, it, vi, beforeEach } from "vitest"

// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
vi.mock("../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { scenarios } from "../testing/index.js"
import { createDirectDriver } from "../testing/drivers/direct.js"
import { __resetEngineForTests } from "../engine/testing/index.js"

const driver = createDirectDriver()

beforeEach(() => {
  vi.clearAllMocks()
  __resetEngineForTests()
})

describe("conformance — direct driver", () => {
  const applicable = scenarios.filter((s) => !s.requiresDOM)

  it.each([...applicable])("$id — $description", async (scenario) => {
    await scenario.run(driver)
  })
})

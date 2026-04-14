import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
vi.mock("../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { scenarios, scenariosForDriver } from "../testing/index.js"
import { createDirectDriver } from "../testing/drivers/direct.js"
import { __resetEngineForTests } from "../engine/testing/index.js"

const driver = createDirectDriver()
const applicable = scenariosForDriver(driver)

beforeEach(() => {
  vi.clearAllMocks()
  __resetEngineForTests()
})

describe("conformance — direct driver", () => {
  it("skips DOM-only scenarios", () => {
    expect(applicable.length).toBeLessThan(scenarios.length)
    expect(applicable.every((scenario) => !scenario.requiresDOM)).toBe(true)
  })

  it.each([...applicable])("$id — $description", async (scenario) => {
    await scenario.run(driver)
  })
})

import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
vi.mock("../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { loadPipeline } from "../engine/pipeline-loader.js"
import { scenarios, scenariosForDriver } from "../testing/index.js"
import { createDirectDriver } from "../testing/drivers/direct.js"
import { __resetEngineForTests } from "../engine/testing/index.js"
import { makeFakePipeline, resetConformanceDocument } from "./conformance.helpers.js"

const mockedLoadPipeline = vi.mocked(loadPipeline)
const driver = createDirectDriver()
const applicable = scenariosForDriver(driver)

beforeEach(() => {
  vi.clearAllMocks()
  __resetEngineForTests()
  resetConformanceDocument("")
})

describe("conformance — direct driver", () => {
  it("is explicitly non-DOM", () => {
    expect(driver.supportsDOM).toBe(false)
  })

  it("skips DOM-only scenarios", () => {
    expect(applicable.length).toBeLessThan(scenarios.length)
    expect(applicable.every((scenario) => !scenario.requiresDOM)).toBe(true)
  })

  it("ignores DOM config and leaves the document untouched", async () => {
    resetConformanceDocument()
    mockedLoadPipeline.mockResolvedValue(makeFakePipeline())

    const core = await driver.create({
      dom: { roots: ["#app"] },
    })

    await core.loadModel()
    await core.translateTo("es")

    expect(document.querySelector("#app p")?.textContent).toBe("Hello world")

    await driver.dispose(core)
  })

  it.each([...applicable])("$id — $description", async (scenario) => {
    await scenario.run(driver)
  })
})

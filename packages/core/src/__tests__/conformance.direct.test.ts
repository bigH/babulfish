import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
vi.mock("../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { loadPipeline } from "../engine/pipeline-loader.js"
import { scenarios, scenariosForDriver } from "../testing/index.js"
import { makeFakePipeline } from "../testing/conformance-helpers.js"
import { createDirectDriver } from "../testing/drivers/direct.js"
import { __resetEngineForTests } from "../engine/testing/index.js"
import { resetConformanceDocument } from "./conformance.dom-fixture.js"

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

  it("resets the shared DOM fixture when requested", () => {
    resetConformanceDocument()
    resetConformanceDocument("")

    expect(document.body.innerHTML).toBe("")
  })

  it("skips DOM-only scenarios", () => {
    expect(applicable.length).toBeLessThan(scenarios.length)
    expect(applicable.every((scenario) => !scenario.requiresDOM)).toBe(true)
  })

  it("strips the entire dom config while preserving non-DOM config", async () => {
    const customLanguages = [{ label: "Esperanto", code: "eo" }] as const
    const otherRoot = document.createElement("div")
    otherRoot.innerHTML = '<div id="other"><p>Leave me alone</p></div>' // eslint-disable-line no-unsanitized/property

    resetConformanceDocument()

    const core = await driver.create({
      dom: {
        root: otherRoot,
        roots: ["#other"],
        translateAttributes: ["aria-label"],
      },
      languages: customLanguages,
    })

    mockedLoadPipeline.mockResolvedValue(makeFakePipeline())
    await core.loadModel()
    await core.translateTo("es")

    expect(core.languages).toEqual(customLanguages)
    expect(document.querySelector("#app p")?.textContent).toBe("Hello world")
    expect(otherRoot.querySelector("#other p")?.textContent).toBe("Leave me alone")

    await driver.dispose(core)
  })

  it.each([...applicable])("$id — $description", async (scenario) => {
    await scenario.run(driver)
  })
})

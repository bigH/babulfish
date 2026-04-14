import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
vi.mock("../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { loadPipeline } from "../engine/pipeline-loader.js"
import { scenarios, scenariosForDriver } from "../testing/index.js"
import { createDirectDriver } from "../testing/drivers/direct.js"
import { __resetEngineForTests } from "../engine/testing/index.js"

const driver = createDirectDriver()
const applicable = scenariosForDriver(driver)
const mockedLoadPipeline = vi.mocked(loadPipeline)

function fakePipeline(translation = "translated"): unknown {
  const generate = async () => [
    { generated_text: [{ role: "assistant", content: translation }] },
  ]
  return Object.assign(generate, { dispose: async () => {} })
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetEngineForTests()
  document.body.innerHTML = ""
})

describe("conformance — direct driver", () => {
  it("skips DOM-only scenarios", () => {
    expect(applicable.length).toBeLessThan(scenarios.length)
    expect(applicable.every((scenario) => !scenario.requiresDOM)).toBe(true)
  })

  it("ignores DOM config and leaves the document untouched", async () => {
    document.body.innerHTML = '<div id="app"><p>Hello world</p></div>' // eslint-disable-line no-unsanitized/property
    mockedLoadPipeline.mockResolvedValue(fakePipeline())

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

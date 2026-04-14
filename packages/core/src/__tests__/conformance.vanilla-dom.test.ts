import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
vi.mock("../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { scenariosForDriver } from "../testing/index.js"
import { createVanillaDomDriver } from "../testing/drivers/vanilla-dom.js"
import { __resetEngineForTests } from "../engine/testing/index.js"

const driver = createVanillaDomDriver()
const rootOverrideScenario = scenariosForDriver(driver).find(
  (scenario) => scenario.id === "root-override",
)

function resetDOM(): void {
  // Safe: hardcoded test fixture, not user content
  document.body.innerHTML = '<div id="app"><p>Hello world</p></div>' // eslint-disable-line no-unsanitized/property
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetEngineForTests()
  resetDOM()
})

describe("conformance — vanilla DOM driver", () => {
  it("exposes a DOM root", () => {
    if (!driver.supportsDOM) {
      throw new Error("Expected vanilla DOM driver to support DOM scenarios")
    }

    expect(driver.root).toBe(document)
  })

  it("supports DOM scenarios with a fragment-backed root", async () => {
    if (!rootOverrideScenario) {
      throw new Error("Expected root-override conformance scenario to exist")
    }
    const range = document.createRange()
    const fragment = range.createContextualFragment('<div id="app"><p>Hello world</p></div>')
    await rootOverrideScenario.run(createVanillaDomDriver(fragment))
  })

  it.each([...scenariosForDriver(driver)])("$id — $description", async (scenario) => {
    await scenario.run(driver)
  })
})

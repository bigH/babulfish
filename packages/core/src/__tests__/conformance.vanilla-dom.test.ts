import { describe, it, vi, beforeEach } from "vitest"

// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
vi.mock("../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { scenarios } from "../testing/index.js"
import { createVanillaDomDriver } from "../testing/drivers/vanilla-dom.js"
import { __resetEngineForTests } from "../engine/testing/index.js"

const driver = createVanillaDomDriver()

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
  it.each([...scenarios])("$id — $description", async (scenario) => {
    await scenario.run(driver)
  })
})

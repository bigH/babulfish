import { describe, it, vi, beforeEach } from "vitest"

// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
vi.mock("../../../core/src/engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { scenariosForDriver } from "@babulfish/core/testing"
import { __resetEngineForTests } from "@babulfish/core/engine/testing"
import { ReactConformanceDriver } from "../testing/react-driver.js"

const driver = ReactConformanceDriver()

function resetDOM(): void {
  document.body.innerHTML = '<div id="app"><p>Hello world</p></div>' // eslint-disable-line no-unsanitized/property -- hardcoded test fixture
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetEngineForTests()
  resetDOM()
})

describe("conformance — react driver", () => {
  it.each([...scenariosForDriver(driver)])("$id — $description", async (scenario) => {
    try {
      await scenario.run(driver)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(
        `[driver="${driver.id}"] [scenario="${scenario.id}"] ${msg}`,
      )
    }
  })
})

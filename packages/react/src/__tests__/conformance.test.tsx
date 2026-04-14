import { beforeEach, describe, expect, it, vi } from "vitest"

// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
vi.mock("../../../core/src/engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { scenarios, scenariosForDriver } from "@babulfish/core/testing"
import { __resetEngineForTests } from "@babulfish/core/engine/testing"
import { ReactConformanceDriver } from "../testing/react-driver.js"

const driver = ReactConformanceDriver()
const applicable = scenariosForDriver(driver)

function resetDOM(): void {
  document.body.innerHTML = '<div id="app"><p>Hello world</p></div>' // eslint-disable-line no-unsanitized/property -- hardcoded test fixture
}

beforeEach(() => {
  vi.clearAllMocks()
  __resetEngineForTests()
  resetDOM()
})

describe("conformance — react driver", () => {
  it("is explicitly DOM-capable", () => {
    expect(driver.supportsDOM).toBe(true)
  })

  it("runs the full shared scenario suite", () => {
    expect(applicable).toHaveLength(scenarios.length)
  })

  it.each([...applicable])("$id — $description", async (scenario) => {
    try {
      await scenario.run(driver)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      throw new Error(`[driver="${driver.id}"] [scenario="${scenario.id}"] ${msg}`)
    }
  })
})

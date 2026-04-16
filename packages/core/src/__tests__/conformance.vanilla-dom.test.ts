import { describe, expect, it, vi, beforeEach } from "vitest"

// Mock pipeline-loader — the ONLY file that imports @huggingface/transformers
vi.mock("../engine/pipeline-loader.js", () => ({
  loadPipeline: vi.fn(),
}))

import { loadPipeline } from "../engine/pipeline-loader.js"
import { makeFakePipeline } from "../testing/conformance-helpers.js"
import { scenariosForDriver } from "../testing/index.js"
import { createVanillaDomDriver } from "../testing/drivers/vanilla-dom.js"
import { __resetEngineForTests } from "../engine/testing/index.js"
import { resetConformanceDocument } from "./conformance.dom-fixture.js"

const mockedLoadPipeline = vi.mocked(loadPipeline)
const driver = createVanillaDomDriver()
const applicable = scenariosForDriver(driver)
const rootOverrideScenario = applicable.find((scenario) => scenario.id === "root-override")

beforeEach(() => {
  vi.clearAllMocks()
  __resetEngineForTests()
  resetConformanceDocument()
})

describe("conformance — vanilla DOM driver", () => {
  it("exposes a DOM root", () => {
    if (!driver.supportsDOM) {
      throw new Error("Expected vanilla DOM driver to support DOM scenarios")
    }

    expect(driver.root).toBe(document)
  })

  it("keeps its constructor root and selector when create() receives dom overrides", async () => {
    const otherRoot = document.createElement("div")
    otherRoot.innerHTML = '<div id="other"><p>Leave me alone</p></div>' // eslint-disable-line no-unsanitized/property

    const core = await driver.create({
      dom: {
        root: otherRoot,
        roots: ["#other"],
      },
    })

    mockedLoadPipeline.mockResolvedValue(makeFakePipeline())
    await core.loadModel()
    await core.translateTo("es")

    expect(document.querySelector("#app p")?.textContent).not.toBe("Hello world")
    expect(otherRoot.querySelector("#other p")?.textContent).toBe("Leave me alone")

    await driver.dispose(core)
  })

  it("passes through non-root dom options", async () => {
    document.body.innerHTML =
      '<div id="app"><button aria-label="Hello world">Hello world</button></div>' // eslint-disable-line no-unsanitized/property

    const core = await driver.create({
      dom: {
        translateAttributes: ["aria-label"],
      },
    })

    mockedLoadPipeline.mockResolvedValue(makeFakePipeline("traducido"))
    await core.loadModel()
    await core.translateTo("es")

    expect(document.querySelector("button")?.getAttribute("aria-label")).toBe("traducido")

    await driver.dispose(core)
  })

  it("supports DOM scenarios with a fragment-backed root", async () => {
    if (!rootOverrideScenario) {
      throw new Error("Expected root-override conformance scenario to exist")
    }
    const range = document.createRange()
    const fragment = range.createContextualFragment('<div id="app"><p>Hello world</p></div>')
    await rootOverrideScenario.run(createVanillaDomDriver(fragment))
  })

  it("keeps a fragment-backed root pinned on the driver", () => {
    const range = document.createRange()
    const fragment = range.createContextualFragment('<div id="app"><p>Hello world</p></div>')
    const fragmentDriver = createVanillaDomDriver(fragment)

    expect(fragmentDriver.supportsDOM).toBe(true)
    expect(fragmentDriver.root).toBe(fragment)
  })

  it.each([...applicable])("$id — $description", async (scenario) => {
    await scenario.run(driver)
  })
})

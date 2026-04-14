import { describe, it, expect } from "vitest"
import { createEngine } from "./engine/index.js"
import { createDOMTranslator } from "./dom/index.js"
import * as barrel from "./index.js"

describe("smoke tests", () => {
  it("creates an engine with correct initial state", () => {
    const engine = createEngine()
    expect(engine).toBeDefined()
    expect(engine.status).toBe("idle")
    expect(typeof engine.load).toBe("function")
    expect(typeof engine.translate).toBe("function")
    expect(typeof engine.dispose).toBe("function")
    expect(typeof engine.on).toBe("function")
  })

  it("creates a DOM translator", () => {
    const translator = createDOMTranslator({
      translate: async (text) => text,
      roots: ["main"],
    })
    expect(translator).toBeDefined()
    expect(typeof translator.translate).toBe("function")
    expect(typeof translator.restore).toBe("function")
    expect(typeof translator.abort).toBe("function")
    expect(translator.isTranslating).toBe(false)
    expect(translator.currentLang).toBeNull()
  })

  it("barrel re-exports engine and dom", () => {
    expect(barrel.createEngine).toBe(createEngine)
    expect(barrel.createDOMTranslator).toBe(createDOMTranslator)
  })
})

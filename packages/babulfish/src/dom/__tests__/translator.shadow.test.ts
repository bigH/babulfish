import { describe, it, expect, vi, afterEach } from "vitest"
import { createDOMTranslator } from "../index.js"
import type { DOMTranslatorConfig } from "../index.js"

function uppercaseTranslate(text: string): Promise<string> {
  return Promise.resolve(text.toUpperCase())
}

afterEach(() => {
  vi.restoreAllMocks()
  while (document.body.firstChild) {
    document.body.removeChild(document.body.firstChild)
  }
})

describe("DOMTranslator with custom root", () => {
  it("translates inside a DocumentFragment without touching global document", async () => {
    const container = document.createElement("main")
    const p = document.createElement("p")
    p.textContent = "hello world"
    container.appendChild(p)
    document.body.appendChild(container)

    const spy = vi.spyOn(document, "querySelector")

    const translator = createDOMTranslator({
      translate: uppercaseTranslate,
      roots: ["main"],
      root: document.body,
    })

    await translator.translate("de")

    expect(p.textContent).toBe("HELLO WORLD")
    expect(spy).not.toHaveBeenCalled()
  })

  it("translates inside a ShadowRoot without touching global document", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const wrapper = document.createElement("section")
    const span = document.createElement("span")
    span.textContent = "shadow text"
    wrapper.appendChild(span)
    shadow.appendChild(wrapper)

    const spy = vi.spyOn(document, "querySelector")

    const translator = createDOMTranslator({
      translate: uppercaseTranslate,
      roots: ["section"],
      root: shadow,
    })

    await translator.translate("fr")

    expect(span.textContent).toBe("SHADOW TEXT")
    expect(spy).not.toHaveBeenCalled()
  })

  it("defaults to global document when root is omitted", async () => {
    const main = document.createElement("main")
    const p = document.createElement("p")
    p.textContent = "default root"
    main.appendChild(p)
    document.body.appendChild(main)

    const translator = createDOMTranslator({
      translate: uppercaseTranslate,
      roots: ["main"],
    })

    await translator.translate("es")

    expect(p.textContent).toBe("DEFAULT ROOT")
  })

  it("restore works with scoped root", async () => {
    const host = document.createElement("div")
    document.body.appendChild(host)
    const shadow = host.attachShadow({ mode: "open" })

    const wrapper = document.createElement("section")
    const span = document.createElement("span")
    span.textContent = "original"
    wrapper.appendChild(span)
    shadow.appendChild(wrapper)

    const translator = createDOMTranslator({
      translate: uppercaseTranslate,
      roots: ["section"],
      root: shadow,
    })

    await translator.translate("de")
    expect(span.textContent).toBe("ORIGINAL")

    translator.restore()
    expect(span.textContent).toBe("original")
  })
})

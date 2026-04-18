import { describe, it, expect, vi, afterEach } from "vitest"
import { createDOMTranslator } from "../translator.js"

function uppercaseTranslate(text: string): Promise<string> {
  return Promise.resolve(text.toUpperCase())
}

type ScopedRootMode = "fragment" | "shadow"

function createScopedRoot(mode: ScopedRootMode): ParentNode {
  if (mode === "fragment") {
    return document.createDocumentFragment()
  }
  const host = document.createElement("div")
  document.body.appendChild(host)
  return host.attachShadow({ mode: "open" })
}

function appendSection(
  root: ParentNode,
  texts: readonly string[],
): readonly HTMLElement[] {
  const section = document.createElement("section")
  const nodes = texts.map((text) => {
    const paragraph = document.createElement("p")
    paragraph.textContent = text
    section.appendChild(paragraph)
    return paragraph
  })
  root.appendChild(section)
  return nodes
}

function createTranslator(root?: ParentNode) {
  return createDOMTranslator({
    translate: uppercaseTranslate,
    roots: ["section"],
    root,
  })
}

afterEach(() => {
  vi.restoreAllMocks()
  document.body.textContent = ""
})

const scopedModes = [
  { label: "DocumentFragment", mode: "fragment" as const },
  { label: "ShadowRoot", mode: "shadow" as const },
]

describe("DOMTranslator with custom root", () => {
  it.each(scopedModes)(
    "translates inside a $label without touching global document",
    async ({ mode }) => {
      const root = createScopedRoot(mode)
      const paragraphs = appendSection(root, ["hello", "world"])
      const spy = vi.spyOn(document, "querySelector")

      const translator = createTranslator(root)

      await translator.translate("fr")

      expect(paragraphs.map((node) => node.textContent)).toEqual([
        "HELLO",
        "WORLD",
      ])
      expect(spy).not.toHaveBeenCalled()
    },
  )

  it("defaults to global document when root is omitted", async () => {
    const main = document.createElement("main")
    const p = document.createElement("p")
    p.textContent = "default root"
    main.appendChild(p)
    document.body.appendChild(main)
    const spy = vi.spyOn(document, "querySelector")

    const translator = createDOMTranslator({
      translate: uppercaseTranslate,
      roots: ["main"],
    })

    await translator.translate("es")

    expect(spy).toHaveBeenCalled()
    expect(p.textContent).toBe("DEFAULT ROOT")
  })

  it.each(scopedModes)(
    "restore works inside a $label",
    async ({ mode }) => {
      const root = createScopedRoot(mode)
      const [paragraph] = appendSection(root, ["original"])
      const translator = createTranslator(root)

      await translator.translate("de")
      expect(paragraph?.textContent).toBe("ORIGINAL")

      translator.restore()
      expect(paragraph?.textContent).toBe("original")
    },
  )

  it.each(scopedModes)(
    "restore traverses nested text nodes inside a $label",
    async ({ mode }) => {
      const root = createScopedRoot(mode)
      const section = document.createElement("section")
      const paragraph = document.createElement("p")
      const strong = document.createElement("strong")
      strong.textContent = "world"
      paragraph.append(
        document.createTextNode("hello "),
        strong,
        document.createTextNode(" again"),
      )
      section.appendChild(paragraph)
      root.appendChild(section)

      const translator = createTranslator(root)

      await translator.translate("de")
      expect(paragraph.textContent).toBe("HELLO WORLD AGAIN")

      translator.restore()
      expect(paragraph.textContent).toBe("hello world again")
      expect(strong.textContent).toBe("world")
    },
  )
})

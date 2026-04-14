import { describe, it, expect, vi, afterEach } from "vitest"
import { createDOMTranslator } from "../translator.js"

function uppercaseTranslate(text: string): Promise<string> {
  return Promise.resolve(text.toUpperCase())
}

type ScopedRootFixture = {
  readonly root: ParentNode
  readonly texts: readonly HTMLElement[]
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

function setUpFragmentRoot(texts: readonly string[]): ScopedRootFixture {
  const root = document.createDocumentFragment()
  return {
    root,
    texts: appendSection(root, texts),
  }
}

function setUpShadowRoot(texts: readonly string[]): ScopedRootFixture {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = host.attachShadow({ mode: "open" })
  return {
    root,
    texts: appendSection(root, texts),
  }
}

function createTranslator(root?: ParentNode | Document) {
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

describe("DOMTranslator with custom root", () => {
  it.each([
    {
      label: "DocumentFragment",
      setUp: () => setUpFragmentRoot(["hello", "world"]),
      expected: ["HELLO", "WORLD"],
    },
    {
      label: "ShadowRoot",
      setUp: () => setUpShadowRoot(["shadow text"]),
      expected: ["SHADOW TEXT"],
    },
  ])("translates inside a $label without touching global document", async ({
    setUp,
    expected,
  }) => {
    const fixture = setUp()
    const spy = vi.spyOn(document, "querySelector")

    const translator = createTranslator(fixture.root)

    await translator.translate("fr")

    expect(fixture.texts.map((node) => node.textContent)).toEqual(expected)
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
    const fixture = setUpShadowRoot(["original"])
    const translator = createTranslator(fixture.root)

    await translator.translate("de")
    expect(fixture.texts[0]?.textContent).toBe("ORIGINAL")

    translator.restore()
    expect(fixture.texts[0]?.textContent).toBe("original")
  })
})

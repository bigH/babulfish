import { describe, it, expect, vi, afterEach } from "vitest"
import { createDOMTranslator } from "../translator.js"

function uppercaseTranslate(text: string): Promise<string> {
  return Promise.resolve(text.toUpperCase())
}

type ScopedRootFixture = {
  readonly root: ParentNode
  readonly texts: readonly HTMLElement[]
}

type ScopedRootMode = "fragment" | "shadow"

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

function setUpScopedRoot(
  mode: ScopedRootMode,
  texts: readonly string[],
): ScopedRootFixture {
  let root: ParentNode
  if (mode === "shadow") {
    const host = document.createElement("div")
    document.body.appendChild(host)
    root = host.attachShadow({ mode: "open" })
  } else {
    root = document.createDocumentFragment()
  }

  return {
    root,
    texts: appendSection(root, texts),
  }
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

describe("DOMTranslator with custom root", () => {
  it.each([
    {
      label: "DocumentFragment",
      mode: "fragment" as const,
      texts: ["hello", "world"] as const,
      expected: ["HELLO", "WORLD"],
    },
    {
      label: "ShadowRoot",
      mode: "shadow" as const,
      texts: ["shadow text"] as const,
      expected: ["SHADOW TEXT"],
    },
  ])("translates inside a $label without touching global document", async ({
    mode,
    texts,
    expected,
  }) => {
    const fixture = setUpScopedRoot(mode, texts)
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
    const spy = vi.spyOn(document, "querySelector")

    const translator = createDOMTranslator({
      translate: uppercaseTranslate,
      roots: ["main"],
    })

    await translator.translate("es")

    expect(spy).toHaveBeenCalled()
    expect(p.textContent).toBe("DEFAULT ROOT")
  })

  it("restore works with scoped root", async () => {
    const fixture = setUpScopedRoot("shadow", ["original"])
    const translator = createTranslator(fixture.root)

    await translator.translate("de")
    expect(fixture.texts[0]?.textContent).toBe("ORIGINAL")

    translator.restore()
    expect(fixture.texts[0]?.textContent).toBe("original")
  })

  it.each([
    { label: "DocumentFragment", mode: "fragment" as const },
    { label: "ShadowRoot", mode: "shadow" as const },
  ])("restore traverses nested text nodes inside a $label", async ({ mode }) => {
    const root =
      mode === "shadow"
        ? (() => {
            const host = document.createElement("div")
            document.body.appendChild(host)
            return host.attachShadow({ mode: "open" })
          })()
        : document.createDocumentFragment()
    const section = document.createElement("section")
    const paragraph = document.createElement("p")
    const leading = document.createTextNode("hello ")
    const strong = document.createElement("strong")
    strong.textContent = "world"
    const trailing = document.createTextNode(" again")
    paragraph.append(leading, strong, trailing)
    section.appendChild(paragraph)
    root.appendChild(section)

    const translator = createTranslator(root)

    await translator.translate("de")
    expect(paragraph.textContent).toBe("HELLO WORLD AGAIN")

    translator.restore()
    expect(paragraph.textContent).toBe("hello world again")
    expect(strong.textContent).toBe("world")
  })
})

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { createDOMTranslator, renderInlineMarkdownToHtml } from "../index.js"
import type { DOMTranslatorConfig, DOMTranslator } from "../index.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTranslate() {
  return vi.fn<(text: string, lang: string) => Promise<string>>()
}

type MockTranslate = ReturnType<typeof mockTranslate>

/** Build a <main> with child elements (test-only static content). */
function setUpMain(
  children: Array<{ tag: string; text: string }>,
): HTMLElement {
  const main = document.createElement("main")
  for (const { tag, text } of children) {
    const el = document.createElement(tag)
    el.textContent = text
    main.appendChild(el)
  }
  document.body.appendChild(main)
  return main
}

/** Build a rich-text span element (test-only static content). */
function setUpRichSpan(
  mdSource: string,
  staticHtml: string,
): HTMLSpanElement {
  const span = document.createElement("span")
  span.setAttribute("data-md", mdSource)
  // Safe: test-only static HTML to simulate rendered markdown
  span.textContent = ""
  const template = document.createElement("template")
  template.innerHTML = staticHtml // eslint-disable-line no-unsanitized/property -- test-only static fixture
  span.appendChild(template.content)
  return span
}

function textContents(root: Element): string[] {
  const texts: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node = walker.nextNode()
  while (node) {
    const t = node.textContent?.trim()
    if (t) texts.push(t)
    node = walker.nextNode()
  }
  return texts
}

function makeTranslator(
  translate: MockTranslate,
  overrides: Partial<DOMTranslatorConfig> = {},
): DOMTranslator {
  return createDOMTranslator({
    translate,
    roots: ["main"],
    ...overrides,
  })
}

const RICH_TEXT_CONFIG: DOMTranslatorConfig["richText"] = {
  selector: "[data-md]",
  sourceAttribute: "data-md",
  render: renderInlineMarkdownToHtml,
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DOM translator", () => {
  let translate: MockTranslate

  beforeEach(() => {
    document.body.textContent = ""
    translate = mockTranslate()
  })

  afterEach(() => {
    document.body.textContent = ""
  })

  // -----------------------------------------------------------------------
  // 1. Text nodes translated
  // -----------------------------------------------------------------------
  it("translates text nodes inside <main>", async () => {
    setUpMain([
      { tag: "p", text: "Hello world" },
      { tag: "p", text: "Goodbye" },
    ])
    translate
      .mockResolvedValueOnce("Hola mundo")
      .mockResolvedValueOnce("Adios")

    const t = makeTranslator(translate)
    await t.translate("es-ES")

    const texts = textContents(document.querySelector("main")!)
    expect(texts).toEqual(["Hola mundo", "Adios"])
  })

  // -----------------------------------------------------------------------
  // 2. Skip tags
  // -----------------------------------------------------------------------
  it("skips text inside <code> and <pre> elements", async () => {
    setUpMain([
      { tag: "p", text: "Translate me" },
      { tag: "code", text: "const x = 1" },
      { tag: "pre", text: "preformatted" },
    ])
    translate.mockResolvedValueOnce("Traduceme")

    const t = makeTranslator(translate)
    await t.translate("es-ES")

    const texts = textContents(document.querySelector("main")!)
    expect(texts).toContain("Traduceme")
    expect(texts).toContain("const x = 1")
    expect(texts).toContain("preformatted")
    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate.mock.calls[0]![0]).toBe("Translate me")
  })

  // -----------------------------------------------------------------------
  // 3. Batching — exceed char limit
  // -----------------------------------------------------------------------
  it("batches text nodes when total chars exceed limit", async () => {
    setUpMain([
      { tag: "p", text: "A".repeat(300) },
      { tag: "p", text: "B".repeat(300) },
    ])
    translate
      .mockResolvedValueOnce("translated-A")
      .mockResolvedValueOnce("translated-B")

    const t = makeTranslator(translate)
    await t.translate("fr")

    expect(translate).toHaveBeenCalledTimes(2)
  })

  // -----------------------------------------------------------------------
  // 4. Restore
  // -----------------------------------------------------------------------
  it("restores all text nodes to original content", async () => {
    setUpMain([
      { tag: "p", text: "Hello" },
      { tag: "p", text: "World" },
    ])
    translate
      .mockResolvedValueOnce("Hola")
      .mockResolvedValueOnce("Mundo")

    const t = makeTranslator(translate)
    await t.translate("es-ES")
    expect(textContents(document.querySelector("main")!)).toEqual([
      "Hola",
      "Mundo",
    ])

    t.restore()
    expect(textContents(document.querySelector("main")!)).toEqual([
      "Hello",
      "World",
    ])
  })

  it("restores original plain text after translate -> translate -> restore", async () => {
    const main = setUpMain([{ tag: "p", text: "Hello" }])
    const paragraph = main.querySelector("p")!

    translate
      .mockResolvedValueOnce("2024")
      .mockResolvedValueOnce("Bonjour")

    const t = makeTranslator(translate)
    await t.translate("es-ES")
    await t.translate("fr")

    expect(translate).toHaveBeenCalledTimes(2)
    expect(translate.mock.calls[0]![0]).toBe("Hello")
    expect(translate.mock.calls[1]![0]).toBe("Hello")
    expect(paragraph.textContent).toBe("Bonjour")

    t.restore()
    expect(paragraph.textContent).toBe("Hello")
  })

  // -----------------------------------------------------------------------
  // 5. Abort — second translate aborts the first
  // -----------------------------------------------------------------------
  it("aborts a prior translation when translate is called again", async () => {
    const main = document.createElement("main")
    for (let i = 0; i < 4; i++) {
      const p = document.createElement("p")
      p.textContent = `Paragraph ${i} ${"x".repeat(500)}`
      main.appendChild(p)
    }
    document.body.appendChild(main)

    let slowResolve: ((v: string) => void) | null = null
    const slowPromise = new Promise<string>((resolve) => {
      slowResolve = resolve
    })

    translate.mockReturnValueOnce(slowPromise)

    const t = makeTranslator(translate)
    const firstCall = t.translate("es-ES")

    translate.mockResolvedValue("fast-result")
    const secondCall = t.translate("fr")

    slowResolve!("slow-result")
    await Promise.allSettled([firstCall, secondCall])

    const texts = textContents(document.querySelector("main")!)
    const slowCount = texts.filter((t) => t === "slow-result").length
    expect(slowCount).toBeLessThan(4)
  })

  // -----------------------------------------------------------------------
  // 6. Whitespace skipped
  // -----------------------------------------------------------------------
  it("skips nodes containing only whitespace", async () => {
    setUpMain([
      { tag: "p", text: "   " },
      { tag: "p", text: "\n\t" },
      { tag: "p", text: "Real text" },
    ])
    translate.mockResolvedValueOnce("Texto real")

    const t = makeTranslator(translate)
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate.mock.calls[0]![0]).toBe("Real text")
  })

  // -----------------------------------------------------------------------
  // 7. RTL direction
  // -----------------------------------------------------------------------
  it("sets dir='rtl' for Arabic and removes it on restore", async () => {
    const main = setUpMain([{ tag: "p", text: "Hello" }])
    translate.mockResolvedValueOnce("\u0645\u0631\u062D\u0628\u0627")

    const t = makeTranslator(translate)
    await t.translate("ar")
    expect(main.getAttribute("dir")).toBe("rtl")

    t.restore()
    expect(main.getAttribute("dir")).toBeNull()
  })

  it("sets dir='ltr' for non-RTL languages", async () => {
    const main = setUpMain([{ tag: "p", text: "Hello" }])
    translate.mockResolvedValueOnce("Bonjour")

    const t = makeTranslator(translate)
    await t.translate("fr")
    expect(main.getAttribute("dir")).toBe("ltr")
  })

  // -----------------------------------------------------------------------
  // 8. Progress hook
  // -----------------------------------------------------------------------
  it("calls onProgress with (done, total) for each batch", async () => {
    const main = document.createElement("main")
    for (let i = 0; i < 2; i++) {
      const p = document.createElement("p")
      p.textContent = "x".repeat(501)
      main.appendChild(p)
    }
    document.body.appendChild(main)

    translate
      .mockResolvedValueOnce("batch1")
      .mockResolvedValueOnce("batch2")

    const onProgress = vi.fn()
    const t = makeTranslator(translate, {
      hooks: { onProgress },
    })
    await t.translate("de")

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2)
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2)
  })

  // -----------------------------------------------------------------------
  // 9. Symbol-only skipped
  // -----------------------------------------------------------------------
  it("skips symbol-only nodes like triangles and dashes", async () => {
    const main = document.createElement("main")
    const p = document.createElement("p")
    p.textContent = "Real sentence"
    const sym1 = document.createElement("span")
    sym1.textContent = "\u25B8"
    const sym2 = document.createElement("span")
    sym2.textContent = "\u2014"
    main.append(sym1, p, sym2)
    document.body.appendChild(main)

    translate.mockResolvedValueOnce("Oracion real")

    const t = makeTranslator(translate)
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate.mock.calls[0]![0]).toBe("Real sentence")
    expect(sym1.textContent).toBe("\u25B8")
    expect(sym2.textContent).toBe("\u2014")
  })

  // -----------------------------------------------------------------------
  // 10. Number-only skipped
  // -----------------------------------------------------------------------
  it("skips number-only nodes like 2024", async () => {
    setUpMain([
      { tag: "span", text: "2024" },
      { tag: "p", text: "Translate me" },
    ])
    translate.mockResolvedValueOnce("Traduceme")

    const t = makeTranslator(translate)
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate.mock.calls[0]![0]).toBe("Translate me")
  })

  // -----------------------------------------------------------------------
  // 11. Single-char skipped
  // -----------------------------------------------------------------------
  it("skips single-character nodes like /", async () => {
    setUpMain([
      { tag: "span", text: "/" },
      { tag: "p", text: "Hello world" },
    ])
    translate.mockResolvedValueOnce("Hola mundo")

    const t = makeTranslator(translate)
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate.mock.calls[0]![0]).toBe("Hello world")
  })

  // -----------------------------------------------------------------------
  // 12. Short real words NOT skipped
  // -----------------------------------------------------------------------
  it("does NOT skip short real words like 'and' or 'AI'", async () => {
    setUpMain([
      { tag: "p", text: "and" },
      { tag: "p", text: "AI" },
    ])
    translate
      .mockResolvedValueOnce("y")
      .mockResolvedValueOnce("IA")

    const t = makeTranslator(translate)
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(2)
    expect(translate.mock.calls[0]![0]).toBe("and")
    expect(translate.mock.calls[1]![0]).toBe("AI")
  })

  // -----------------------------------------------------------------------
  // 13. Mixed symbols and text
  // -----------------------------------------------------------------------
  it("excludes symbols from batches without misaligning", async () => {
    const main = document.createElement("main")
    const p1 = document.createElement("p")
    p1.textContent = "First sentence"
    const bullet = document.createElement("span")
    bullet.textContent = "\u2022"
    const p2 = document.createElement("p")
    p2.textContent = "Second sentence"
    main.append(p1, bullet, p2)
    document.body.appendChild(main)

    translate
      .mockResolvedValueOnce("Primera oracion")
      .mockResolvedValueOnce("Segunda oracion")

    const t = makeTranslator(translate)
    await t.translate("es-ES")

    expect(bullet.textContent).toBe("\u2022")
    expect(p1.textContent).toBe("Primera oracion")
    expect(p2.textContent).toBe("Segunda oracion")
  })

  // -----------------------------------------------------------------------
  // 14. Batch misalignment
  // -----------------------------------------------------------------------
  it("handles batch misalignment gracefully", async () => {
    const main = document.createElement("main")
    const wrapper = document.createElement("span")
    const textA = document.createTextNode("Hello")
    const textB = document.createTextNode("World")
    wrapper.appendChild(textA)
    wrapper.appendChild(textB)
    main.appendChild(wrapper)
    document.body.appendChild(main)

    translate.mockResolvedValueOnce("HolaWorld-combined")

    const t = makeTranslator(translate)
    await t.translate("es-ES")

    expect(textA.textContent).toBe("HolaWorld-combined")
    expect(textB.textContent).toBe("")
  })

  // -----------------------------------------------------------------------
  // 15. Rich text (markdown) translation
  // -----------------------------------------------------------------------
  it("translates rich text elements as full markdown strings", async () => {
    const main = document.createElement("main")
    const span = setUpRichSpan("hello **world**", "hello <strong>world</strong>")
    main.appendChild(span)
    document.body.appendChild(main)

    translate.mockResolvedValueOnce("hola **mundo**")

    const t = makeTranslator(translate, { richText: RICH_TEXT_CONFIG })
    await t.translate("es-ES")

    expect(span.innerHTML).toBe("hola <strong>mundo</strong>")
  })

  // -----------------------------------------------------------------------
  // 16. Text nodes inside rich text elements are skipped
  // -----------------------------------------------------------------------
  it("skips text nodes inside rich text elements in the text walker", async () => {
    const main = document.createElement("main")
    const p = document.createElement("p")
    p.textContent = "Normal text"
    const span = setUpRichSpan("**bold**", "<strong>bold</strong>")
    main.appendChild(p)
    main.appendChild(span)
    document.body.appendChild(main)

    translate
      .mockResolvedValueOnce("**negrita**")
      .mockResolvedValueOnce("Texto normal")

    const t = makeTranslator(translate, { richText: RICH_TEXT_CONFIG })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(2)
    expect(translate.mock.calls[0]![0]).toBe("**bold**")
    expect(translate.mock.calls[1]![0]).toBe("Normal text")
  })

  // -----------------------------------------------------------------------
  // 17. Dropped markers: plain text fallback
  // -----------------------------------------------------------------------
  it("renders plain text when model drops all markers", async () => {
    const main = document.createElement("main")
    const span = setUpRichSpan("hello **world**", "hello <strong>world</strong>")
    main.appendChild(span)
    document.body.appendChild(main)

    translate.mockResolvedValueOnce("hola mundo")

    const t = makeTranslator(translate, { richText: RICH_TEXT_CONFIG })
    await t.translate("es-ES")

    expect(span.textContent).toBe("hola mundo")
    expect(span.innerHTML).not.toContain("<strong>")
  })

  // -----------------------------------------------------------------------
  // 18. Merged bold spans preserved
  // -----------------------------------------------------------------------
  it("preserves bold when model merges multiple spans into one", async () => {
    const main = document.createElement("main")
    const span = setUpRichSpan(
      "build **scalable** and **reliable** systems",
      "build <strong>scalable</strong> and <strong>reliable</strong> systems",
    )
    main.appendChild(span)
    document.body.appendChild(main)

    translate.mockResolvedValueOnce(
      "construire des systemes **evolutifs et fiables**",
    )

    const t = makeTranslator(translate, { richText: RICH_TEXT_CONFIG })
    await t.translate("fr")

    expect(span.innerHTML).toContain("<strong>")
    expect(span.textContent).toContain("evolutifs et fiables")
  })

  // -----------------------------------------------------------------------
  // 19. Unclosed markers: plain text fallback
  // -----------------------------------------------------------------------
  it("falls back to plain text when translated markdown has unclosed markers", async () => {
    const main = document.createElement("main")
    const span = setUpRichSpan("hello **world**", "hello <strong>world</strong>")
    main.appendChild(span)
    document.body.appendChild(main)

    translate.mockResolvedValueOnce("hola **mundo")

    const t = makeTranslator(translate, { richText: RICH_TEXT_CONFIG })
    await t.translate("es-ES")

    expect(span.textContent).toBe("hola mundo")
    expect(span.innerHTML).not.toContain("<strong>")
  })

  // -----------------------------------------------------------------------
  // 20. Preserve matchers (string)
  // -----------------------------------------------------------------------
  it("replaces preserved strings with placeholders in rich text", async () => {
    const main = document.createElement("main")
    const span = setUpRichSpan(
      "Working at **Chime** on infrastructure",
      "Working at <strong>Chime</strong> on infrastructure",
    )
    main.appendChild(span)
    document.body.appendChild(main)

    translate.mockImplementation(async (text: string) => {
      expect(text).toContain("\u27EA0\u27EB")
      expect(text).not.toContain("Chime")
      return "Trabajando en **\u27EA0\u27EB** en infraestructura"
    })

    const t = makeTranslator(translate, {
      preserve: { matchers: ["Chime"] },
      richText: RICH_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(span.textContent).toContain("Chime")
    expect(span.innerHTML).toContain("<strong>Chime</strong>")
  })

  // -----------------------------------------------------------------------
  // 21. Restore restores rich text elements
  // -----------------------------------------------------------------------
  it("restores both rich text and text elements on restore", async () => {
    const main = document.createElement("main")
    const span = setUpRichSpan("hello **world**", "hello <strong>world</strong>")
    const p = document.createElement("p")
    p.textContent = "Normal text"
    main.appendChild(span)
    main.appendChild(p)
    document.body.appendChild(main)

    const originalHtml = span.innerHTML

    translate
      .mockResolvedValueOnce("hola **mundo**")
      .mockResolvedValueOnce("Texto normal")

    const t = makeTranslator(translate, { richText: RICH_TEXT_CONFIG })
    await t.translate("es-ES")

    expect(span.innerHTML).toBe("hola <strong>mundo</strong>")
    expect(p.textContent).toBe("Texto normal")

    t.restore()

    expect(span.innerHTML).toBe(originalHtml)
    expect(p.textContent).toBe("Normal text")
  })

  // -----------------------------------------------------------------------
  // 22. Progress includes rich text
  // -----------------------------------------------------------------------
  it("includes rich text elements in progress total", async () => {
    const main = document.createElement("main")
    const span = setUpRichSpan("hello **world**", "hello <strong>world</strong>")
    const p = document.createElement("p")
    p.textContent = "Normal text"
    main.appendChild(span)
    main.appendChild(p)
    document.body.appendChild(main)

    translate
      .mockResolvedValueOnce("hola **mundo**")
      .mockResolvedValueOnce("Texto normal")

    const onProgress = vi.fn()
    const t = makeTranslator(translate, {
      richText: RICH_TEXT_CONFIG,
      hooks: { onProgress },
    })
    await t.translate("es-ES")

    expect(onProgress).toHaveBeenCalledTimes(2)
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 2)
    expect(onProgress).toHaveBeenNthCalledWith(2, 2, 2)
  })

  // -----------------------------------------------------------------------
  // NEW: Configurable roots
  // -----------------------------------------------------------------------
  it("translates across multiple configurable roots", async () => {
    const header = document.createElement("header")
    const h1 = document.createElement("h1")
    h1.textContent = "Title"
    header.appendChild(h1)

    const main = document.createElement("main")
    const p = document.createElement("p")
    p.textContent = "Body"
    main.appendChild(p)

    document.body.appendChild(header)
    document.body.appendChild(main)

    translate
      .mockResolvedValueOnce("Titulo")
      .mockResolvedValueOnce("Cuerpo")

    const t = createDOMTranslator({
      translate,
      roots: ["header", "main"],
    })
    await t.translate("es-ES")

    expect(textContents(header)).toEqual(["Titulo"])
    expect(textContents(main)).toEqual(["Cuerpo"])
  })

  // -----------------------------------------------------------------------
  // NEW: Phases
  // -----------------------------------------------------------------------
  it("translates in phase order when phases are configured", async () => {
    const main = document.createElement("main")
    const h2 = document.createElement("h2")
    h2.textContent = "Section heading"
    const p = document.createElement("p")
    p.textContent = "Body text"
    main.appendChild(h2)
    main.appendChild(p)
    document.body.appendChild(main)

    const callOrder: string[] = []
    translate.mockImplementation(async (text: string) => {
      callOrder.push(text)
      return `translated-${text}`
    })

    const t = createDOMTranslator({
      translate,
      roots: ["main"],
      phases: ["main h2", "main"],
    })
    await t.translate("es-ES")

    // h2 content should be translated before p content
    expect(callOrder.indexOf("Section heading")).toBeLessThan(
      callOrder.indexOf("Body text"),
    )
  })

  // -----------------------------------------------------------------------
  // NEW: Preserve matchers — RegExp
  // -----------------------------------------------------------------------
  it("supports RegExp preserve matchers", async () => {
    const main = document.createElement("main")
    const span = setUpRichSpan(
      "Version **v2.1.0** is out",
      "Version <strong>v2.1.0</strong> is out",
    )
    main.appendChild(span)
    document.body.appendChild(main)

    translate.mockImplementation(async (text: string) => {
      expect(text).not.toMatch(/v\d+\.\d+\.\d+/)
      return `Version **\u27EA0\u27EB** esta disponible`
    })

    const t = makeTranslator(translate, {
      preserve: { matchers: [/v\d+\.\d+\.\d+/] },
      richText: RICH_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(span.textContent).toContain("v2.1.0")
  })

  // -----------------------------------------------------------------------
  // NEW: Preserve matchers — function
  // -----------------------------------------------------------------------
  it("supports function preserve matchers", async () => {
    const main = document.createElement("main")
    const span = setUpRichSpan(
      "Contact **support@co.com** for help",
      "Contact <strong>support@co.com</strong> for help",
    )
    main.appendChild(span)
    document.body.appendChild(main)

    const emailMatcher = (text: string) => {
      const matches = text.match(/[\w.]+@[\w.]+/g)
      return matches ? Array.from(matches) : []
    }

    translate.mockImplementation(async (text: string) => {
      expect(text).not.toContain("support@co.com")
      return `Contacta **\u27EA0\u27EB** para ayuda`
    })

    const t = makeTranslator(translate, {
      preserve: { matchers: [emailMatcher] },
      richText: RICH_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(span.textContent).toContain("support@co.com")
  })

  // -----------------------------------------------------------------------
  // NEW: LinkedBy config
  // -----------------------------------------------------------------------
  it("translates linked elements once per key", async () => {
    const main = document.createElement("main")
    const a = document.createElement("span")
    a.setAttribute("data-section-title", "intro")
    a.textContent = "Introduction"
    const b = document.createElement("span")
    b.setAttribute("data-section-title", "intro")
    b.textContent = "Introduction"
    main.appendChild(a)
    main.appendChild(b)
    document.body.appendChild(main)

    translate.mockResolvedValueOnce("Introduccion")

    const t = makeTranslator(translate, {
      linkedBy: {
        selector: "[data-section-title]",
        keyAttribute: "data-section-title",
      },
    })
    await t.translate("es-ES")

    // Called only once for the group, applied to both
    expect(translate).toHaveBeenCalledTimes(1)
    expect(a.textContent).toBe("Introduccion")
    expect(b.textContent).toBe("Introduccion")
  })

  it("restores linked groups after translate -> translate -> restore", async () => {
    const main = document.createElement("main")
    const a = document.createElement("span")
    a.setAttribute("data-section-title", "intro")
    a.textContent = "Introduction"
    const b = document.createElement("span")
    b.setAttribute("data-section-title", "intro")
    b.textContent = "Introduction"
    main.append(a, b)
    document.body.appendChild(main)

    translate
      .mockResolvedValueOnce("2024")
      .mockResolvedValueOnce("Apercu")

    const t = makeTranslator(translate, {
      linkedBy: {
        selector: "[data-section-title]",
        keyAttribute: "data-section-title",
      },
    })

    await t.translate("es-ES")
    await t.translate("fr")

    expect(translate).toHaveBeenCalledTimes(2)
    expect(translate.mock.calls[0]![0]).toBe("Introduction")
    expect(translate.mock.calls[1]![0]).toBe("Introduction")
    expect(a.textContent).toBe("Apercu")
    expect(b.textContent).toBe("Apercu")

    t.restore()
    expect(a.textContent).toBe("Introduction")
    expect(b.textContent).toBe("Introduction")
  })

  it("treats the current linked text as a new source after restore and DOM mutation", async () => {
    const main = document.createElement("main")
    const a = document.createElement("span")
    a.setAttribute("data-section-title", "intro")
    a.textContent = "Introduction"
    const b = document.createElement("span")
    b.setAttribute("data-section-title", "intro")
    b.textContent = "Introduction"
    main.append(a, b)
    document.body.appendChild(main)

    translate
      .mockResolvedValueOnce("Introduccion")
      .mockResolvedValueOnce("Zusammenfassung")

    const t = makeTranslator(translate, {
      linkedBy: {
        selector: "[data-section-title]",
        keyAttribute: "data-section-title",
      },
    })

    await t.translate("es-ES")
    t.restore()

    a.textContent = "Summary"
    b.textContent = "Summary"

    await t.translate("de")

    expect(translate).toHaveBeenCalledTimes(2)
    expect(translate.mock.calls[1]![0]).toBe("Summary")
    expect(a.textContent).toBe("Zusammenfassung")
    expect(b.textContent).toBe("Zusammenfassung")
  })

  it("restores remounted linked nodes from the keyed original source", async () => {
    const main = document.createElement("main")
    const a = document.createElement("span")
    a.setAttribute("data-section-title", "intro")
    a.textContent = "Introduction"
    const b = document.createElement("span")
    b.setAttribute("data-section-title", "intro")
    b.textContent = "Introduction"
    main.append(a, b)
    document.body.appendChild(main)

    translate
      .mockResolvedValueOnce("Introduccion")
      .mockResolvedValueOnce("Apercu")

    const t = makeTranslator(translate, {
      linkedBy: {
        selector: "[data-section-title]",
        keyAttribute: "data-section-title",
      },
    })

    await t.translate("es-ES")

    const remounted = document.createElement("span")
    remounted.setAttribute("data-section-title", "intro")
    remounted.textContent = "Introduccion"
    b.replaceWith(remounted)

    await t.translate("fr")

    expect(translate).toHaveBeenCalledTimes(2)
    expect(translate.mock.calls[1]![0]).toBe("Introduction")
    expect(a.textContent).toBe("Apercu")
    expect(remounted.textContent).toBe("Apercu")

    t.restore()

    expect(a.textContent).toBe("Introduction")
    expect(remounted.textContent).toBe("Introduction")
  })

  // -----------------------------------------------------------------------
  // NEW: Lifecycle hooks
  // -----------------------------------------------------------------------
  it("calls onTranslateStart and onTranslateEnd hooks", async () => {
    setUpMain([{ tag: "p", text: "Hello" }])

    translate.mockResolvedValueOnce("Hola")

    const onTranslateStart = vi.fn()
    const onTranslateEnd = vi.fn()
    const t = makeTranslator(translate, {
      hooks: { onTranslateStart, onTranslateEnd },
    })
    await t.translate("es-ES")

    expect(onTranslateStart).toHaveBeenCalledTimes(1)
    expect(onTranslateEnd).toHaveBeenCalledTimes(1)
    expect(onTranslateStart.mock.calls[0]![0]!.tagName).toBe("P")
    expect(onTranslateEnd.mock.calls[0]![0]!.tagName).toBe("P")
  })

  // -----------------------------------------------------------------------
  // NEW: onDirectionChange hook
  // -----------------------------------------------------------------------
  it("calls onDirectionChange when dir is set", async () => {
    setUpMain([{ tag: "p", text: "Hello" }])
    translate.mockResolvedValueOnce("\u0645\u0631\u062D\u0628\u0627")

    const onDirectionChange = vi.fn()
    const t = makeTranslator(translate, {
      hooks: { onDirectionChange },
    })
    await t.translate("ar")

    expect(onDirectionChange).toHaveBeenCalledTimes(1)
    expect(onDirectionChange.mock.calls[0]![1]).toBe("rtl")
  })

  // -----------------------------------------------------------------------
  // NEW: translateAttributes
  // -----------------------------------------------------------------------
  it("translates configured attributes", async () => {
    const main = document.createElement("main")
    const a = document.createElement("a")
    a.textContent = "Click me"
    a.setAttribute("title", "Go home")
    a.setAttribute("aria-label", "Navigate home")
    main.appendChild(a)
    document.body.appendChild(main)

    translate
      .mockResolvedValueOnce("Haz clic")
      .mockResolvedValueOnce("Ir a casa")
      .mockResolvedValueOnce("Navegar")

    const t = makeTranslator(translate, {
      translateAttributes: ["title", "aria-label"],
    })
    await t.translate("es-ES")

    expect(a.getAttribute("title")).toBe("Ir a casa")
    expect(a.getAttribute("aria-label")).toBe("Navegar")
  })

  it("restores translated attributes on restore", async () => {
    const main = document.createElement("main")
    const a = document.createElement("a")
    a.textContent = "Click"
    a.setAttribute("title", "Go home")
    main.appendChild(a)
    document.body.appendChild(main)

    translate
      .mockResolvedValueOnce("Clic")
      .mockResolvedValueOnce("Ir a casa")

    const t = makeTranslator(translate)
    await t.translate("es-ES")
    expect(a.getAttribute("title")).toBe("Ir a casa")

    t.restore()
    expect(a.getAttribute("title")).toBe("Go home")
  })

  it("restores translated attributes after translate -> translate -> restore", async () => {
    const main = document.createElement("main")
    const a = document.createElement("a")
    a.setAttribute("title", "Go home")
    main.appendChild(a)
    document.body.appendChild(main)

    translate
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("Aller a la maison")

    const t = makeTranslator(translate)
    await t.translate("es-ES")
    await t.translate("fr")

    expect(translate).toHaveBeenCalledTimes(2)
    expect(translate.mock.calls[0]![0]).toBe("Go home")
    expect(translate.mock.calls[1]![0]).toBe("Go home")
    expect(a.getAttribute("title")).toBe("Aller a la maison")

    t.restore()
    expect(a.getAttribute("title")).toBe("Go home")
  })

  // -----------------------------------------------------------------------
  // NEW: shouldSkip extension
  // -----------------------------------------------------------------------
  it("allows extending shouldSkip logic", async () => {
    setUpMain([
      { tag: "p", text: "@mention" },
      { tag: "p", text: "Translate me" },
    ])
    translate.mockResolvedValueOnce("Traduceme")

    const t = makeTranslator(translate, {
      shouldSkip: (text, def) =>
        def(text) || text.startsWith("@"),
    })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate.mock.calls[0]![0]).toBe("Translate me")
  })

  // -----------------------------------------------------------------------
  // NEW: Instance isolation
  // -----------------------------------------------------------------------
  it("two translator instances do not interfere", async () => {
    const main1 = document.createElement("main")
    main1.id = "root1"
    const p1 = document.createElement("p")
    p1.textContent = "One"
    main1.appendChild(p1)
    document.body.appendChild(main1)

    const main2 = document.createElement("main")
    main2.id = "root2"
    const p2 = document.createElement("p")
    p2.textContent = "Two"
    main2.appendChild(p2)
    document.body.appendChild(main2)

    const t1Translate = mockTranslate()
    const t2Translate = mockTranslate()

    t1Translate.mockResolvedValueOnce("Uno")
    t2Translate.mockResolvedValueOnce("Zwei")

    const t1 = createDOMTranslator({
      translate: t1Translate,
      roots: ["#root1"],
    })
    const t2 = createDOMTranslator({
      translate: t2Translate,
      roots: ["#root2"],
    })

    await t1.translate("es-ES")
    await t2.translate("de")

    expect(p1.textContent).toBe("Uno")
    expect(p2.textContent).toBe("Zwei")

    // Restoring t1 should not affect t2
    t1.restore()
    expect(p1.textContent).toBe("One")
    expect(p2.textContent).toBe("Zwei")

    t2.restore()
    expect(p2.textContent).toBe("Two")
  })

  // -----------------------------------------------------------------------
  // NEW: isTranslating and currentLang
  // -----------------------------------------------------------------------
  it("tracks isTranslating and currentLang", async () => {
    setUpMain([{ tag: "p", text: "Hello" }])

    let capturedTranslating = false
    const t = makeTranslator(translate)

    translate.mockImplementation(async () => {
      capturedTranslating = t.isTranslating
      return "Hola"
    })

    expect(t.isTranslating).toBe(false)
    expect(t.currentLang).toBeNull()

    await t.translate("es-ES")

    expect(capturedTranslating).toBe(true)
    expect(t.isTranslating).toBe(false)
    expect(t.currentLang).toBe("es-ES")
  })

  // -----------------------------------------------------------------------
  // NEW: abort()
  // -----------------------------------------------------------------------
  it("abort() stops translation and clears isTranslating", async () => {
    const main = document.createElement("main")
    const p = document.createElement("p")
    p.textContent = "Hello world content here"
    main.appendChild(p)
    document.body.appendChild(main)

    let resolveTranslation: ((v: string) => void) | null = null
    translate.mockReturnValueOnce(
      new Promise<string>((resolve) => {
        resolveTranslation = resolve
      }),
    )

    const t = makeTranslator(translate)
    const promise = t.translate("es-ES")

    t.abort()
    expect(t.isTranslating).toBe(false)

    resolveTranslation!("Should not appear")
    await promise

    expect(p.textContent).toBe("Hello world content here")
  })

  // -----------------------------------------------------------------------
  // NEW: Custom batchCharLimit
  // -----------------------------------------------------------------------
  it("respects custom batchCharLimit", async () => {
    setUpMain([
      { tag: "p", text: "Short" },
      { tag: "p", text: "Also short" },
    ])

    translate
      .mockResolvedValueOnce("Corto")
      .mockResolvedValueOnce("Tambien corto")

    const t = makeTranslator(translate, { batchCharLimit: 1 })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(2)
  })

  // -----------------------------------------------------------------------
  // NEW: Custom RTL languages
  // -----------------------------------------------------------------------
  it("supports custom RTL language set", async () => {
    const main = setUpMain([{ tag: "p", text: "Hello" }])
    translate.mockResolvedValueOnce("Custom RTL")

    const t = makeTranslator(translate, {
      rtlLanguages: new Set(["xx"]),
    })
    await t.translate("xx")

    expect(main.getAttribute("dir")).toBe("rtl")
  })

  // -----------------------------------------------------------------------
  // NEW: Custom skipTags
  // -----------------------------------------------------------------------
  it("respects custom skipTags", async () => {
    const main = document.createElement("main")
    const custom = document.createElement("my-widget")
    custom.textContent = "Skip me"
    const p = document.createElement("p")
    p.textContent = "Translate me"
    main.appendChild(custom)
    main.appendChild(p)
    document.body.appendChild(main)

    translate.mockResolvedValueOnce("Traduceme")

    const t = makeTranslator(translate, { skipTags: ["my-widget"] })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate.mock.calls[0]![0]).toBe("Translate me")
    expect(custom.textContent).toBe("Skip me")
  })
})

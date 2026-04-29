import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderInlineMarkdownToHtml } from "../markdown.js"
import { createDOMTranslator, type DOMTranslatorConfig, type DOMTranslator } from "../translator.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockTranslate() {
  return vi.fn<(text: string, lang: string) => Promise<string>>()
}

type MockTranslate = ReturnType<typeof mockTranslate>

function expectTranslateCalls(translate: MockTranslate, ...inputs: string[]): void {
  expect(translate.mock.calls.map((call) => call[0])).toEqual(inputs)
}

type MainChild =
  | Node
  | {
    tag: keyof HTMLElementTagNameMap
    text?: string
    attrs?: Record<string, string>
  }

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  options?: {
    text?: string
    attrs?: Record<string, string>
  },
): HTMLElementTagNameMap[K]
function createElement(
  tag: string,
  options?: {
    text?: string
    attrs?: Record<string, string>
  },
): HTMLElement
function createElement(
  tag: string,
  {
    text,
    attrs = {},
  }: {
    text?: string
    attrs?: Record<string, string>
  } = {},
): HTMLElement {
  const el = document.createElement(tag)
  if (text !== undefined) {
    el.textContent = text
  }
  for (const [name, value] of Object.entries(attrs)) {
    el.setAttribute(name, value)
  }
  return el
}

/** Build a <main> fixture with test-only static content. */
function setUpMain(
  children: MainChild[],
): HTMLElement {
  const main = createElement("main")
  for (const child of children) {
    if (child instanceof Node) {
      main.appendChild(child)
      continue
    }

    main.appendChild(createElement(child.tag, {
      text: child.text,
      attrs: child.attrs,
    }))
  }
  document.body.appendChild(main)
  return main
}

/** Build a rich-text span element (test-only static content). */
function setUpRichSpan(
  mdSource: string,
  staticHtml: string,
): HTMLSpanElement {
  const span = createElement("span", {
    attrs: { "data-md": mdSource },
  })
  // Safe: test-only static HTML to simulate rendered markdown
  span.textContent = ""
  const template = document.createElement("template")
  template.innerHTML = staticHtml // eslint-disable-line no-unsanitized/property -- test-only static fixture
  span.appendChild(template.content)
  return span
}

function setUpRichTextMain(
  mdSource: string,
  staticHtml: string,
): HTMLSpanElement {
  const span = setUpRichSpan(mdSource, staticHtml)
  setUpMain([span])
  return span
}

function setUpHtmlMain(html: string): HTMLElement {
  const main = createElement("main")
  const template = document.createElement("template")
  template.innerHTML = html // eslint-disable-line no-unsanitized/property -- test-only static fixture
  main.appendChild(template.content)
  document.body.appendChild(main)
  return main
}

function setUpLinkedMain(
  key: string,
  [firstText, secondText]: readonly [string, string],
): readonly [HTMLSpanElement, HTMLSpanElement] {
  const first = createElement("span", {
    text: firstText,
    attrs: { "data-section-title": key },
  })
  const second = createElement("span", {
    text: secondText,
    attrs: { "data-section-title": key },
  })
  setUpMain([first, second])
  return [first, second]
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

const STRUCTURED_TEXT_CONFIG: DOMTranslatorConfig["structuredText"] = {
  selector: ".structured",
}

const TEST_PRESERVE_TOKEN_PREFIX = "__BF_PRESERVE_"
const TEST_PRESERVE_TOKEN_SUFFIX = "__"
const TEST_STRUCTURED_TOKEN_PREFIX = "\u27EAbf-st:"
const TEST_STRUCTURED_TOKEN_SUFFIX = "\u27EB"

type StructuredIntegrityFailureMode = "missing" | "duplicate" | "reordered"

function replaceAllVisibleText(
  input: string,
  replacements: Record<string, string>,
): string {
  let result = input
  for (const [source, translated] of Object.entries(replacements)) {
    result = result.replaceAll(source, translated)
  }
  return result
}

function collectPreserveTokens(input: string): string[] {
  const tokens: string[] = []
  let cursor = 0

  while (true) {
    const start = input.indexOf(TEST_PRESERVE_TOKEN_PREFIX, cursor)
    if (start < 0) return tokens

    const end = input.indexOf(
      TEST_PRESERVE_TOKEN_SUFFIX,
      start + TEST_PRESERVE_TOKEN_PREFIX.length,
    )
    if (end < 0) {
      throw new Error("Malformed preserve token output in test fixture")
    }

    tokens.push(input.slice(start, end + TEST_PRESERVE_TOKEN_SUFFIX.length))
    cursor = end + TEST_PRESERVE_TOKEN_SUFFIX.length
  }
}

function expectSinglePreserveToken(input: string): string {
  const tokens = collectPreserveTokens(input)
  expect(tokens).toHaveLength(1)
  return tokens[0]!
}

function collectStructuredTokens(input: string): string[] {
  const tokens: string[] = []
  let cursor = 0

  while (true) {
    const start = input.indexOf(TEST_STRUCTURED_TOKEN_PREFIX, cursor)
    if (start < 0) return tokens

    const end = input.indexOf(
      TEST_STRUCTURED_TOKEN_SUFFIX,
      start + TEST_STRUCTURED_TOKEN_PREFIX.length,
    )
    if (end < 0) {
      throw new Error("Malformed structured token output in test fixture")
    }

    tokens.push(input.slice(start, end + TEST_STRUCTURED_TOKEN_SUFFIX.length))
    cursor = end + TEST_STRUCTURED_TOKEN_SUFFIX.length
  }
}

function damageStructuredOutput(
  input: string,
  mode: StructuredIntegrityFailureMode,
  replacements: Record<string, string>,
): string {
  const translated = replaceAllVisibleText(input, replacements)
  const [first, second] = collectStructuredTokens(translated)

  if (!first) {
    throw new Error("Expected at least one structured token in test fixture")
  }

  switch (mode) {
    case "missing":
      return translated.replace(first, "")
    case "duplicate":
      return translated.replace(first, `${first}${first}`)
    case "reordered": {
      if (!second) {
        throw new Error("Expected at least two structured tokens in test fixture")
      }
      const swapMarker = "__bf-structured-swap__"
      return translated
        .replace(first, swapMarker)
        .replace(second, first)
        .replace(swapMarker, second)
    }
  }
}

async function waitForDefined<T>(
  getValue: () => T | null,
): Promise<T> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const value = getValue()
    if (value !== null) return value
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
  throw new Error("Timed out waiting for test value")
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
    expectTranslateCalls(translate, "Translate me")
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

    expectTranslateCalls(translate, "Hello", "Hello")
    expect(paragraph.textContent).toBe("Bonjour")

    t.restore()
    expect(paragraph.textContent).toBe("Hello")
  })

  // -----------------------------------------------------------------------
  // 5. Abort — second translate aborts the first
  // -----------------------------------------------------------------------
  it("aborts a prior translation when translate is called again", async () => {
    setUpMain(
      Array.from({ length: 4 }, (_, i) => ({
        tag: "p",
        text: `Paragraph ${i} ${"x".repeat(500)}`,
      })),
    )

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

    expectTranslateCalls(translate, "Real text")
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
    setUpMain([
      { tag: "p", text: "x".repeat(501) },
      { tag: "p", text: "x".repeat(501) },
    ])

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

    expectTranslateCalls(translate, "Real sentence")
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

    expectTranslateCalls(translate, "Translate me")
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

    expectTranslateCalls(translate, "Hello world")
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

    expectTranslateCalls(translate, "and", "AI")
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
    const span = setUpRichTextMain(
      "hello **world**",
      "hello <strong>world</strong>",
    )

    translate.mockResolvedValueOnce("hola **mundo**")

    const t = makeTranslator(translate, { richText: RICH_TEXT_CONFIG })
    await t.translate("es-ES")

    expect(span.innerHTML).toBe("hola <strong>mundo</strong>")
  })

  // -----------------------------------------------------------------------
  // 16. Text nodes inside rich text elements are skipped
  // -----------------------------------------------------------------------
  it("skips text nodes inside rich text elements in the text walker", async () => {
    const span = setUpRichSpan("**bold**", "<strong>bold</strong>")
    setUpMain([
      { tag: "p", text: "Normal text" },
      span,
    ])

    translate
      .mockResolvedValueOnce("**negrita**")
      .mockResolvedValueOnce("Texto normal")

    const t = makeTranslator(translate, { richText: RICH_TEXT_CONFIG })
    await t.translate("es-ES")

    expectTranslateCalls(translate, "Normal text", "**bold**")
  })

  // -----------------------------------------------------------------------
  // 17. Dropped markers: plain text fallback
  // -----------------------------------------------------------------------
  it("renders plain text when model drops all markers", async () => {
    const span = setUpRichTextMain(
      "hello **world**",
      "hello <strong>world</strong>",
    )

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
    const span = setUpRichTextMain(
      "build **scalable** and **reliable** systems",
      "build <strong>scalable</strong> and <strong>reliable</strong> systems",
    )

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
    const span = setUpRichTextMain(
      "hello **world**",
      "hello <strong>world</strong>",
    )

    translate.mockResolvedValueOnce("hola **mundo")

    const t = makeTranslator(translate, { richText: RICH_TEXT_CONFIG })
    await t.translate("es-ES")

    expect(span.textContent).toBe("hola mundo")
    expect(span.innerHTML).not.toContain("<strong>")
  })

  it("falls back to plain text when translated markdown has an unclosed italic marker", async () => {
    const span = setUpRichTextMain(
      "hello *world*",
      "hello <em>world</em>",
    )

    translate.mockResolvedValueOnce("hola *mundo")

    const t = makeTranslator(translate, { richText: RICH_TEXT_CONFIG })
    await t.translate("es-ES")

    expect(span.textContent).toBe("hola mundo")
    expect(span.innerHTML).not.toContain("<em>")
  })

  // -----------------------------------------------------------------------
  // 20. Preserve matchers (string)
  // -----------------------------------------------------------------------
  it("replaces preserved strings with placeholders for legacy two-arg rich-text callbacks", async () => {
    const span = setUpRichTextMain(
      "Working at **Chime** on infrastructure",
      "Working at <strong>Chime</strong> on infrastructure",
    )

    const legacyTranslate = vi.fn(async (text: string, _lang: string) => {
      const token = expectSinglePreserveToken(text)
      expect(text).not.toContain("Chime")
      return `Trabajando en **${token}** en infraestructura`
    })

    expect(legacyTranslate.length).toBe(2)

    const t = makeTranslator(legacyTranslate, {
      preserve: { matchers: ["Chime"] },
      richText: RICH_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(span.textContent).toContain("Chime")
    expect(span.innerHTML).toContain("<strong>Chime</strong>")
  })

  it("passes rich-text preservation intent to opt-in callbacks with a defaulted third parameter", async () => {
    const span = setUpRichTextMain(
      "Working at **Chime** on infrastructure",
      "Working at <strong>Chime</strong> on infrastructure",
    )
    const calls: Array<{
      readonly text: string
      readonly options: Parameters<DOMTranslatorConfig["translate"]>[2]
    }> = []
    const adapterAwareTranslate: DOMTranslatorConfig["translate"] = async (
      text: string,
      _lang: string,
      options: Parameters<DOMTranslatorConfig["translate"]>[2] = {},
    ) => {
      calls.push({ text, options })
      return "Trabajando en **Chime** en infraestructura"
    }

    expect(adapterAwareTranslate.length).toBe(2)

    const t = createDOMTranslator({
      translate: adapterAwareTranslate,
      passTranslationIntent: true,
      roots: ["main"],
      preserve: { matchers: ["Chime"] },
      richText: RICH_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(calls).toEqual([
      {
        text: "Working at **Chime** on infrastructure",
        options: {
          content_type: "markdown",
          substrings_to_preserve: ["Chime"],
        },
      },
    ])
    expect(span.innerHTML).toBe("Trabajando en <strong>Chime</strong> en infraestructura")
  })

  it("keeps preserve matchers scoped away from plain text batches", async () => {
    const main = setUpMain([
      { tag: "p", text: "Working at Chime" },
    ])

    translate.mockImplementation(async (text: string) => {
      expect(text).toBe("Working at Chime")
      return "Trabajando en banco"
    })

    const t = makeTranslator(translate, {
      preserve: { matchers: ["Chime"] },
    })
    await t.translate("es-ES")

    expect(main.textContent).toBe("Trabajando en banco")
  })

  // -----------------------------------------------------------------------
  // 21. Restore restores rich text elements
  // -----------------------------------------------------------------------
  it("restores both rich text and text elements on restore", async () => {
    const span = setUpRichSpan("hello **world**", "hello <strong>world</strong>")
    const p = createElement("p", { text: "Normal text" })
    setUpMain([span, p])

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
    const span = setUpRichSpan("hello **world**", "hello <strong>world</strong>")
    const p = createElement("p", { text: "Normal text" })
    setUpMain([span, p])

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
  // 23. Structured text
  // -----------------------------------------------------------------------
  it("resolves structured selectors against descendants only, not the root itself", async () => {
    const main = setUpHtmlMain('<p class="structured">Hello <strong>world</strong></p>')
    main.className = "structured"
    const paragraph = main.querySelector("p")!

    translate.mockImplementation(async (text: string) =>
      replaceAllVisibleText(text, {
        Hello: "Hola",
        world: "mundo",
      }))

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(paragraph.innerHTML).toBe("Hola <strong>mundo</strong>")
  })

  it("rehydrates supported structured inline shapes without flattening them", async () => {
    const main = setUpHtmlMain(
      [
        '<p class="structured">',
        'Hello <a href="/docs">docs</a> <strong>bold</strong> <b>loud</b> ',
        '<em>soft</em> <i>tilt</i> <u>under</u> <s>strike</s> ',
        '<del>gone</del> <mark>highlight</mark> <span>plain</span>',
        "</p>",
      ].join(""),
    )
    const paragraph = main.querySelector("p")!

    translate.mockImplementation(async (text: string) =>
      replaceAllVisibleText(text, {
        Hello: "Hola",
        docs: "documentos",
        bold: "negrita",
        loud: "fuerte",
        soft: "suave",
        tilt: "inclina",
        under: "subraya",
        strike: "tacha",
        gone: "ido",
        highlight: "marca",
        plain: "simple",
      }))

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(paragraph.innerHTML).toBe(
      [
        'Hola <a href="/docs">documentos</a> <strong>negrita</strong> <b>fuerte</b> ',
        '<em>suave</em> <i>inclina</i> <u>subraya</u> <s>tacha</s> ',
        '<del>ido</del> <mark>marca</mark> <span>simple</span>',
      ].join(""),
    )
  })

  it("rejects nested structured candidates and falls back to the plain collector", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Hello <span class="structured">world</span></p>',
    )
    const paragraph = main.querySelector("p")!

    translate.mockImplementation(async (text: string) =>
      replaceAllVisibleText(text, {
        Hello: "Hola",
        world: "mundo",
      }))

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expectTranslateCalls(translate, "Hello ", "world")
    expect(paragraph.innerHTML).toBe('Hola <span class="structured">mundo</span>')
  })

  it("rejects non-inert span wrappers and falls back to the plain collector", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Hello <span role="note">world</span></p>',
    )
    const paragraph = main.querySelector("p")!

    translate.mockImplementation(async (text: string) =>
      replaceAllVisibleText(text, {
        Hello: "Hola",
        world: "mundo",
      }))

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expectTranslateCalls(translate, "Hello ", "world")
    expect(paragraph.innerHTML).toBe('Hola <span role="note">mundo</span>')
  })

  it("lets authored richText and structuredText coexist without collisions", async () => {
    const rich = setUpRichSpan("hello **world**", "hello <strong>world</strong>")
    const structured = document.createElement("p")
    structured.className = "structured"
    structured.innerHTML = "Other <em>phrase</em>" // eslint-disable-line no-unsanitized/property -- test-only static fixture
    setUpMain([rich, structured])

    translate.mockImplementation(async (text: string) => {
      if (text.includes("**")) {
        return "hola **mundo**"
      }
      return replaceAllVisibleText(text, {
        Other: "Otro",
        phrase: "frase",
      })
    })

    const t = makeTranslator(translate, {
      richText: RICH_TEXT_CONFIG,
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(2)
    expect(rich.innerHTML).toBe("hola <strong>mundo</strong>")
    expect(structured.innerHTML).toBe("Otro <em>frase</em>")
  })

  it("keeps preserve intent working when richText and structuredText run together", async () => {
    const rich = setUpRichSpan(
      "Working at **Chime**",
      "Working at <strong>Chime</strong>",
    )
    const structured = document.createElement("p")
    structured.className = "structured"
    structured.innerHTML =
      'Version <strong>v2.1.0</strong> ships today' // eslint-disable-line no-unsanitized/property -- test-only static fixture
    setUpMain([rich, structured])

    const calls: Array<{
      readonly text: string
      readonly options: Parameters<DOMTranslatorConfig["translate"]>[2]
    }> = []
    const adapterAwareTranslate = async (
      text: string,
      _lang: string,
      options?: Parameters<DOMTranslatorConfig["translate"]>[2],
    ) => {
      calls.push({ text, options })

      if (options?.content_type === "markdown") {
        expect(options.substrings_to_preserve).toEqual(["Chime"])
        return "Trabajando en **Chime**"
      }

      if (options?.content_type === "structured") {
        expect(options.substrings_to_preserve).toContain("v2.1.0")
        expect(
          options.substrings_to_preserve?.some((substring) =>
            substring.startsWith(TEST_STRUCTURED_TOKEN_PREFIX)),
        ).toBe(true)
        return replaceAllVisibleText(text, {
          "ships today": "ya disponible",
        })
      }

      throw new Error(`Unexpected translation intent: ${String(options?.content_type)}`)
    }

    const t = createDOMTranslator({
      translate: adapterAwareTranslate,
      passTranslationIntent: true,
      roots: ["main"],
      preserve: { matchers: ["Chime", /v\d+\.\d+\.\d+/] },
      richText: RICH_TEXT_CONFIG,
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(calls.map(({ options }) => options?.content_type)).toEqual([
      "markdown",
      "structured",
    ])
    expect(rich.innerHTML).toBe("Trabajando en <strong>Chime</strong>")
    expect(structured.innerHTML).toBe(
      "Version <strong>v2.1.0</strong> ya disponible",
    )
  })

  it("dedupes structured candidates found through overlapping translation roots", async () => {
    const main = setUpHtmlMain(
      [
        "<article>",
        '<p class="structured">Hello <strong>world</strong></p>',
        "</article>",
      ].join(""),
    )
    const paragraph = main.querySelector("p")!

    translate.mockImplementation(async (text: string) =>
      replaceAllVisibleText(text, {
        Hello: "Hola",
        world: "mundo",
      }))

    const t = makeTranslator(translate, {
      roots: ["main", "main article"],
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(paragraph.innerHTML).toBe("Hola <strong>mundo</strong>")
  })

  it("keeps linkedBy precedence over structuredText and avoids double visible work", async () => {
    const main = document.createElement("main")
    const first = document.createElement("span")
    first.setAttribute("data-section-title", "intro")
    first.textContent = "Introduction"

    const structured = document.createElement("p")
    structured.className = "structured"
    const inlineLinked = document.createElement("span")
    inlineLinked.setAttribute("data-section-title", "intro")
    inlineLinked.textContent = "Introduction"
    structured.append(inlineLinked, document.createTextNode(" details"))

    main.append(first, structured)
    document.body.appendChild(main)

    translate.mockImplementation(async (text: string) =>
      replaceAllVisibleText(text, {
        Introduction: "Introduccion",
        details: "detalles",
      }))

    const t = makeTranslator(translate, {
      linkedBy: {
        selector: "[data-section-title]",
        keyAttribute: "data-section-title",
      },
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expectTranslateCalls(translate, "Introduction", " details")
    expect(first.textContent).toBe("Introduccion")
    expect(inlineLinked.textContent).toBe("Introduccion")
    expect(structured.innerHTML).toBe(
      '<span data-section-title="intro">Introduccion</span> detalles',
    )
  })

  it("preserves code islands inside structured text", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Run <code>npm test</code> now</p>',
    )
    const paragraph = main.querySelector("p")!

    translate.mockImplementation(async (text: string) =>
      replaceAllVisibleText(text, {
        Run: "Ejecuta",
        now: "ahora",
      }))

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(paragraph.innerHTML).toBe("Ejecuta <code>npm test</code> ahora")
  })

  it("applies preserve matchers before structured text translation", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Version <strong>v2.1.0</strong> ships today</p>',
    )
    const paragraph = main.querySelector("p")!

    translate.mockImplementation(async (text: string) => {
      expectSinglePreserveToken(text)
      expect(text).not.toContain("v2.1.0")

      return replaceAllVisibleText(text, {
        "ships today": "ya disponible",
      })
    })

    const t = makeTranslator(translate, {
      preserve: { matchers: [/v\d+\.\d+\.\d+/] },
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(paragraph.innerHTML).toBe(
      "Version <strong>v2.1.0</strong> ya disponible",
    )
  })

  it("round-trips br elements as logical line breaks in structured text", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Line one<br>Line two</p>',
    )
    const paragraph = main.querySelector("p")!

    translate.mockImplementation(async (text: string) =>
      replaceAllVisibleText(text, {
        Line: "Linea",
        one: "uno",
        two: "dos",
      }))

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(1)
    expect(translate.mock.calls[0]?.[0]).toContain("\n")
    expect(paragraph.innerHTML).toBe("Linea uno<br>Linea dos")
  })

  it.each([
    { label: "missing", mode: "missing" as const },
    { label: "duplicate", mode: "duplicate" as const },
    { label: "reordered", mode: "reordered" as const },
  ])("falls back locally when structured output has $label tokens", async ({ mode }) => {
    const main = setUpHtmlMain(
      '<p class="structured">Hello <strong>world</strong> again</p>',
    )
    const paragraph = main.querySelector("p")!

    const onTranslateStart = vi.fn()
    const onTranslateEnd = vi.fn()
    const onProgress = vi.fn()

    let callCount = 0
    translate.mockImplementation(async (text: string) => {
      callCount++
      if (callCount === 1) {
        return damageStructuredOutput(text, mode, {
          Hello: "Hola",
          world: "mundo",
          again: "otra vez",
        })
      }
      return "Hola mundo otra vez"
    })

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
      hooks: { onTranslateStart, onTranslateEnd, onProgress },
    })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(2)
    expect(paragraph.querySelector("strong")).not.toBeNull()
    expect(paragraph.querySelector("strong")?.textContent).toBe("")
    expect(paragraph.textContent).toBe("Hola mundo otra vez")
    expect(onTranslateStart).toHaveBeenCalledTimes(1)
    expect(onTranslateStart).toHaveBeenCalledWith(paragraph)
    expect(onTranslateEnd).toHaveBeenCalledTimes(1)
    expect(onTranslateEnd).toHaveBeenCalledWith(paragraph)
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenCalledWith(1, 1)
  })

  it("preserves matchers through structured fallback writes", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Version <strong>v2.1.0</strong> ships today</p>',
    )
    const paragraph = main.querySelector("p")!

    let callCount = 0
    translate.mockImplementation(async (text: string) => {
      callCount++
      const token = expectSinglePreserveToken(text)
      expect(text).not.toContain("v2.1.0")

      if (callCount === 1) {
        return damageStructuredOutput(text, "missing", {
          "ships today": "ya disponible",
        })
      }

      return `Version ${token} ya disponible`
    })

    const t = makeTranslator(translate, {
      preserve: { matchers: [/v\d+\.\d+\.\d+/] },
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(translate).toHaveBeenCalledTimes(2)
    expect(paragraph.textContent).toBe("Version v2.1.0 ya disponible")
  })

  it.each([
    { label: "success", mode: null },
    { label: "fallback", mode: "missing" as const },
  ])("keeps attrs inside structured roots as separate work after structured $label", async ({
    mode,
  }) => {
    const main = setUpHtmlMain(
      '<p class="structured"><a href="/docs" title="Read docs">Hello <strong>world</strong></a></p>',
    )
    const paragraph = main.querySelector("p")!
    const link = main.querySelector("a")!

    let callCount = 0
    translate.mockImplementation(async (text: string) => {
      callCount++
      if (callCount === 1 && mode) {
        return damageStructuredOutput(text, mode, {
          Hello: "Hola",
          world: "mundo",
        })
      }
      if (callCount <= (mode ? 2 : 1)) {
        return mode
          ? "Hola mundo"
          : replaceAllVisibleText(text, {
            Hello: "Hola",
            world: "mundo",
          })
      }
      return "Leer docs"
    })

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(link.getAttribute("title")).toBe("Leer docs")
    expect(translate.mock.calls.some(([source]) => source === "Read docs")).toBe(true)
    expect(paragraph.querySelector("strong")).not.toBeNull()
  })

  it("restores the captured structured subtree before local fallback writes", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Hello <span class="note" data-note="keep">world</span> again</p>',
    )
    const paragraph = main.querySelector("p")!

    let callCount = 0
    translate.mockImplementation(async (text: string) => {
      callCount++
      if (callCount === 1) {
        paragraph.innerHTML = 'mutated <em>markup</em>' // eslint-disable-line no-unsanitized/property -- test-only mutation to prove fallback restores the snapshot first
        return damageStructuredOutput(text, "missing", {
          Hello: "Hola",
          world: "mundo",
          again: "otra vez",
        })
      }
      return "Hola mundo otra vez"
    })

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    const preservedSpan = paragraph.querySelector("span.note")
    expect(paragraph.querySelector("em")).toBeNull()
    expect(preservedSpan).not.toBeNull()
    expect(preservedSpan?.getAttribute("data-note")).toBe("keep")
    expect(paragraph.textContent).toBe("Hola mundo otra vez")
  })

  it("keeps planned attribute writes attached to the live structured subtree after local fallback", async () => {
    const main = setUpHtmlMain(
      '<p class="structured"><a href="/docs" title="Read docs">Hello <strong>world</strong></a></p>',
    )
    const link = main.querySelector("a")!

    let callCount = 0
    translate.mockImplementation(async (text: string) => {
      callCount++
      if (callCount === 1) {
        link.setAttribute("title", "Mutated title")
        return damageStructuredOutput(text, "missing", {
          Hello: "Hola",
          world: "mundo",
        })
      }
      if (callCount === 2) {
        return "Hola mundo"
      }
      if (callCount === 3) {
        expect(text).toBe("Read docs")
        return "Leer docs"
      }
      throw new Error(`Unexpected translate input: ${text}`)
    })

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(link.getAttribute("title")).toBe("Leer docs")
  })

  it("aborts before exact structured commit and leaves the subtree unchanged", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Hello <strong>world</strong></p>',
    )
    const paragraph = main.querySelector("p")!
    const originalInnerHTML = paragraph.innerHTML

    let serialized = ""
    let resolveTranslation: ((value: string) => void) | null = null
    translate.mockImplementationOnce(async (text: string) => {
      serialized = text
      return await new Promise<string>((resolve) => {
        resolveTranslation = resolve
      })
    })

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    const promise = t.translate("es-ES")

    const exactResolver = await waitForDefined(() => resolveTranslation)
    t.abort()
    exactResolver(replaceAllVisibleText(serialized, {
      Hello: "Hola",
      world: "mundo",
    }))
    await promise

    expect(t.isTranslating).toBe(false)
    expect(paragraph.innerHTML).toBe(originalInnerHTML)
  })

  it("aborts before structured fallback commit and leaves the subtree unchanged", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Hello <strong>world</strong></p>',
    )
    const paragraph = main.querySelector("p")!
    const originalInnerHTML = paragraph.innerHTML

    let resolveFallback: ((value: string) => void) | null = null
    let callCount = 0
    translate.mockImplementation(async (text: string) => {
      callCount++
      if (callCount === 1) {
        return damageStructuredOutput(text, "missing", {
          Hello: "Hola",
          world: "mundo",
        })
      }
      return await new Promise<string>((resolve) => {
        resolveFallback = resolve
      })
    })

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    const promise = t.translate("es-ES")

    const fallbackResolver = await waitForDefined(() => resolveFallback)
    t.abort()
    fallbackResolver("Hola mundo")
    await promise

    expect(t.isTranslating).toBe(false)
    expect(paragraph.innerHTML).toBe(originalInnerHTML)
  })

  it("restores structured roots after structured fallback", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Hello <strong>world</strong></p>',
    )
    const paragraph = main.querySelector("p")!
    const originalInnerHTML = paragraph.innerHTML

    let callCount = 0
    translate.mockImplementation(async (text: string) => {
      callCount++
      if (callCount === 1) {
        return damageStructuredOutput(text, "reordered", {
          Hello: "Hola",
          world: "mundo",
        })
      }
      return "Hola mundo"
    })

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(paragraph.innerHTML).not.toBe(originalInnerHTML)

    t.restore()
    expect(paragraph.innerHTML).toBe(originalInnerHTML)
  })

  it("restores structured roots from their original subtree snapshot", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Hello <strong>world</strong></p>',
    )
    const paragraph = main.querySelector("p")!
    const originalInnerHTML = paragraph.innerHTML

    translate.mockImplementation(async (text: string) =>
      replaceAllVisibleText(text, {
        Hello: "Hola",
        world: "mundo",
      }))

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    paragraph.innerHTML = "mutated <em>markup</em>" // eslint-disable-line no-unsanitized/property -- test-only dynamic mutation

    t.restore()
    expect(paragraph.innerHTML).toBe(originalInnerHTML)
  })

  it("applies outputTransform before exact structured rehydration with the logical source", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Hello <strong>world</strong></p>',
    )
    const paragraph = main.querySelector("p")!

    const outputTransform = vi.fn((translated: string, context) => {
      expect(context).toEqual({
        kind: "structuredText",
        targetLang: "es-ES",
        source: "Hello world",
      })
      return replaceAllVisibleText(translated, {
        Hola: "Saludos",
      })
    })

    translate.mockImplementation(async (text: string) =>
      replaceAllVisibleText(text, {
        Hello: "Hola",
        world: "mundo",
      }))

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
      outputTransform,
    })
    await t.translate("es-ES")

    expect(outputTransform).toHaveBeenCalledTimes(1)
    expect(paragraph.innerHTML).toBe("Saludos <strong>mundo</strong>")
  })

  it("applies outputTransform again before structured local fallback commit", async () => {
    const main = setUpHtmlMain(
      '<p class="structured">Hello <strong>world</strong> again</p>',
    )
    const paragraph = main.querySelector("p")!

    let callCount = 0
    translate.mockImplementation(async (text: string) => {
      callCount++
      if (callCount === 1) {
        return damageStructuredOutput(text, "missing", {
          Hello: "Hola",
          world: "mundo",
          again: "otra vez",
        })
      }
      return "Hola mundo otra vez"
    })

    let transformCallCount = 0
    const outputTransform = vi.fn((translated: string, context) => {
      transformCallCount++
      expect(context).toEqual({
        kind: "structuredText",
        targetLang: "es-ES",
        source: "Hello world again",
      })
      return transformCallCount === 1
        ? translated
        : `Transformado ${translated}`
    })

    const t = makeTranslator(translate, {
      structuredText: STRUCTURED_TEXT_CONFIG,
      outputTransform,
    })
    await t.translate("es-ES")

    expect(outputTransform).toHaveBeenCalledTimes(2)
    expect(paragraph.querySelector("strong")).not.toBeNull()
    expect(paragraph.textContent).toBe("Transformado Hola mundo otra vez")
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

  it("keeps linkedBy work first overall before mixed visible work in a phase", async () => {
    const rich = setUpRichSpan("Rich **source**", "Rich <strong>source</strong>")
    const structured = document.createElement("p")
    structured.className = "structured"
    structured.innerHTML = "Structured <em>phrase</em>" // eslint-disable-line no-unsanitized/property -- test-only static fixture
    const linked = createElement("h2", {
      text: "Linked title",
      attrs: { "data-section-title": "intro" },
    })
    setUpMain([
      { tag: "p", text: "Plain text" },
      rich,
      structured,
      linked,
    ])

    const callKinds: string[] = []
    translate.mockImplementation(async (text: string) => {
      if (text === "Linked title") {
        callKinds.push("linked")
        return "Titulo enlazado"
      }
      if (text === "Plain text") {
        callKinds.push("plain")
        return "Texto plano"
      }
      if (text === "Rich **source**") {
        callKinds.push("rich")
        return "Rico **origen**"
      }
      if (text.includes(TEST_STRUCTURED_TOKEN_PREFIX)) {
        callKinds.push("structured")
        return replaceAllVisibleText(text, {
          Structured: "Estructurado",
          phrase: "frase",
        })
      }
      throw new Error(`Unexpected translate input: ${text}`)
    })

    const t = makeTranslator(translate, {
      phases: ["main"],
      linkedBy: {
        selector: "[data-section-title]",
        keyAttribute: "data-section-title",
      },
      richText: RICH_TEXT_CONFIG,
      structuredText: STRUCTURED_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(callKinds).toEqual(["linked", "plain", "rich", "structured"])
  })

  it("merges plain batches, richText, and structuredText by document order inside a phase", async () => {
    const main = document.createElement("main")

    const mixed = document.createElement("p")
    mixed.append(document.createTextNode("Before"))
    const rich = setUpRichSpan("Rich **source**", "Rich <strong>source</strong>")
    mixed.append(rich, document.createTextNode("After"))

    const structured = document.createElement("p")
    structured.className = "structured"
    structured.innerHTML = "Structured <em>phrase</em>" // eslint-disable-line no-unsanitized/property -- test-only static fixture

    const tail = createElement("p", { text: "Tail text" })

    main.append(mixed, structured, tail)
    document.body.appendChild(main)

    const callKinds: string[] = []
    const onTranslateStart = vi.fn()
    const onTranslateEnd = vi.fn()
    const onProgress = vi.fn()

    translate.mockImplementation(async (text: string) => {
      if (text === "Before\nAfter") {
        callKinds.push("batch")
        return "Antes\nDespues"
      }
      if (text === "Rich **source**") {
        callKinds.push("rich")
        return "Rico **origen**"
      }
      if (text.includes(TEST_STRUCTURED_TOKEN_PREFIX)) {
        callKinds.push("structured")
        return replaceAllVisibleText(text, {
          Structured: "Estructurado",
          phrase: "frase",
        })
      }
      if (text === "Tail text") {
        callKinds.push("tail")
        return "Texto final"
      }
      throw new Error(`Unexpected translate input: ${text}`)
    })

    const t = makeTranslator(translate, {
      phases: ["main"],
      richText: RICH_TEXT_CONFIG,
      structuredText: STRUCTURED_TEXT_CONFIG,
      hooks: { onTranslateStart, onTranslateEnd, onProgress },
    })
    await t.translate("es-ES")

    expect(callKinds).toEqual(["batch", "rich", "structured", "tail"])
    expect(onTranslateStart.mock.calls.map(([element]) => element)).toEqual([
      mixed,
      rich,
      structured,
      tail,
    ])
    expect(onTranslateEnd.mock.calls.map(([element]) => element)).toEqual([
      mixed,
      rich,
      structured,
      tail,
    ])
    expect(onProgress.mock.calls).toEqual([
      [1, 4],
      [2, 4],
      [3, 4],
      [4, 4],
    ])
  })

  it("runs attrs after visible work in document order by element and translateAttributes order", async () => {
    const rich = setUpRichSpan("Rich **source**", "Rich <strong>source</strong>")
    rich.setAttribute("title", "Rich title")

    const plain = createElement("p", {
      text: "Plain text",
      attrs: { title: "Plain title" },
    })
    const link = createElement("a", {
      text: "Link text",
      attrs: {
        title: "Link title",
        "aria-label": "Link label",
      },
    })
    setUpMain([plain, link, rich])

    const callKinds: string[] = []
    const onTranslateStart = vi.fn()
    const onTranslateEnd = vi.fn()
    const onProgress = vi.fn()

    translate.mockImplementation(async (text: string) => {
      if (text === "Plain text") {
        callKinds.push("plain")
        return "Texto plano"
      }
      if (text === "Link text") {
        callKinds.push("link")
        return "Texto del enlace"
      }
      if (text === "Rich **source**") {
        callKinds.push("rich")
        return "Rico **origen**"
      }
      if (text === "Plain title") {
        callKinds.push("plain:title")
        return "Titulo plano"
      }
      if (text === "Link label") {
        callKinds.push("link:aria-label")
        return "Etiqueta del enlace"
      }
      if (text === "Link title") {
        callKinds.push("link:title")
        return "Titulo del enlace"
      }
      if (text === "Rich title") {
        callKinds.push("rich:title")
        return "Titulo enriquecido"
      }
      throw new Error(`Unexpected translate input: ${text}`)
    })

    const t = makeTranslator(translate, {
      phases: ["main"],
      richText: RICH_TEXT_CONFIG,
      translateAttributes: ["aria-label", "title"],
      hooks: { onTranslateStart, onTranslateEnd, onProgress },
    })
    await t.translate("es-ES")

    expect(callKinds).toEqual([
      "plain",
      "link",
      "rich",
      "plain:title",
      "link:aria-label",
      "link:title",
      "rich:title",
    ])
    expect(onTranslateStart.mock.calls.map(([element]) => element)).toEqual([
      plain,
      link,
      rich,
    ])
    expect(onTranslateEnd.mock.calls.map(([element]) => element)).toEqual([
      plain,
      link,
      rich,
    ])
    expect(onProgress.mock.calls).toEqual([
      [1, 7],
      [2, 7],
      [3, 7],
      [4, 7],
      [5, 7],
      [6, 7],
      [7, 7],
    ])
    expect(plain.getAttribute("title")).toBe("Titulo plano")
    expect(link.getAttribute("aria-label")).toBe("Etiqueta del enlace")
    expect(link.getAttribute("title")).toBe("Titulo del enlace")
    expect(rich.getAttribute("title")).toBe("Titulo enriquecido")
  })

  it("applies outputTransform to plain text batches before applyTranslation and attrs before setAttribute", async () => {
    const paragraph = document.createElement("p")
    const firstText = document.createTextNode("Before")
    const secondText = document.createTextNode("After")
    paragraph.append(firstText, secondText)

    const titled = createElement("span", {
      attrs: { title: "Go home" },
    })
    setUpMain([paragraph, titled])

    const outputTransform = vi.fn((translated: string, context) => {
      if (context.kind === "text") {
        expect(context).toEqual({
          kind: "text",
          targetLang: "es-ES",
          source: "Before\nAfter",
        })
        return "ANTES\nDESPUES"
      }

      expect(context).toEqual({
        kind: "attr",
        targetLang: "es-ES",
        source: "Go home",
        attribute: "title",
      })
      return `Transformado ${translated}`
    })

    translate.mockImplementation(async (text: string) => {
      if (text === "Before\nAfter") return "Antes\nDespues"
      if (text === "Go home") return "Ir a casa"
      throw new Error(`Unexpected translate input: ${text}`)
    })

    const t = makeTranslator(translate, {
      outputTransform,
    })
    await t.translate("es-ES")

    expect(outputTransform).toHaveBeenNthCalledWith(1, "Antes\nDespues", {
      kind: "text",
      targetLang: "es-ES",
      source: "Before\nAfter",
    })
    expect(outputTransform).toHaveBeenNthCalledWith(2, "Ir a casa", {
      kind: "attr",
      targetLang: "es-ES",
      source: "Go home",
      attribute: "title",
    })
    expect(outputTransform.mock.calls[0]?.[1]?.attribute).toBeUndefined()
    expect(firstText.textContent).toBe("ANTES")
    expect(secondText.textContent).toBe("DESPUES")
    expect(titled.getAttribute("title")).toBe("Transformado Ir a casa")
  })

  // -----------------------------------------------------------------------
  // NEW: Preserve matchers — RegExp
  // -----------------------------------------------------------------------
  it("supports RegExp preserve matchers", async () => {
    const span = setUpRichTextMain(
      "Version **v2.1.0** is out",
      "Version <strong>v2.1.0</strong> is out",
    )

    translate.mockImplementation(async (text: string) => {
      expect(text).not.toMatch(/v\d+\.\d+\.\d+/)
      return `Version **${expectSinglePreserveToken(text)}** esta disponible`
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
    const span = setUpRichTextMain(
      "Contact **support@co.com** for help",
      "Contact <strong>support@co.com</strong> for help",
    )

    const emailMatcher = (text: string) => {
      const matches = text.match(/[\w.]+@[\w.]+/g)
      return matches ? Array.from(matches) : []
    }

    translate.mockImplementation(async (text: string) => {
      expect(text).not.toContain("support@co.com")
      return `Contacta **${expectSinglePreserveToken(text)}** para ayuda`
    })

    const t = makeTranslator(translate, {
      preserve: { matchers: [emailMatcher] },
      richText: RICH_TEXT_CONFIG,
    })
    await t.translate("es-ES")

    expect(span.textContent).toContain("support@co.com")
  })

  it("applies outputTransform to richText after placeholder restoration and preserves fallback behavior", async () => {
    const span = setUpRichTextMain(
      "Working at **Chime** on infrastructure",
      "Working at <strong>Chime</strong> on infrastructure",
    )

    const outputTransform = vi.fn((translated: string, context) => {
      expect(translated).toBe("Trabajando en **Chime** en infraestructura")
      expect(context).toEqual({
        kind: "richText",
        targetLang: "es-ES",
        source: "Working at **Chime** on infrastructure",
      })
      return "Trabajando en **Chime en infraestructura"
    })

    translate.mockImplementation(async (text: string) => {
      const token = expectSinglePreserveToken(text)
      expect(text).not.toContain("Chime")
      return `Trabajando en **${token}** en infraestructura`
    })

    const t = makeTranslator(translate, {
      preserve: { matchers: ["Chime"] },
      richText: RICH_TEXT_CONFIG,
      outputTransform,
    })
    await t.translate("es-ES")

    expect(outputTransform).toHaveBeenCalledTimes(1)
    expect(span.textContent).toBe("Trabajando en Chime en infraestructura")
    expect(span.innerHTML).not.toContain("<strong>")
  })

  it("passes transformed markdown to custom richText validate before render", async () => {
    const span = setUpRichTextMain(
      "hello **world**",
      "hello <strong>world</strong>",
    )

    const outputTransform = vi.fn((translated: string) => `${translated} *again*`)
    const validate = vi.fn((markdown: string) => markdown === "hola **mundo** *again*")
    const render = vi.fn((markdown: string) =>
      renderInlineMarkdownToHtml(markdown).toUpperCase(),
    )

    translate.mockResolvedValueOnce("hola **mundo**")

    const t = makeTranslator(translate, {
      richText: {
        ...RICH_TEXT_CONFIG,
        render,
        validate,
      },
      outputTransform,
    })
    await t.translate("es-ES")

    expect(outputTransform).toHaveBeenCalledTimes(1)
    expect(validate).toHaveBeenCalledTimes(1)
    expect(validate).toHaveBeenCalledWith("hola **mundo** *again*")
    expect(render).toHaveBeenCalledTimes(1)
    expect(render).toHaveBeenCalledWith("hola **mundo** *again*")
    expect(span.innerHTML).toBe("HOLA <strong>MUNDO</strong> <em>AGAIN</em>")
  })

  it("skips custom richText render and strips markers when validate rejects transformed markdown", async () => {
    const span = setUpRichTextMain(
      "hello **world**",
      "hello <strong>world</strong>",
    )

    const outputTransform = vi.fn(() => "hola **mundo** *otra*")
    const validate = vi.fn(() => false)
    const render = vi.fn((markdown: string) => renderInlineMarkdownToHtml(markdown))

    translate.mockResolvedValueOnce("hola **mundo**")

    const t = makeTranslator(translate, {
      richText: {
        ...RICH_TEXT_CONFIG,
        render,
        validate,
      },
      outputTransform,
    })
    await t.translate("es-ES")

    expect(validate).toHaveBeenCalledTimes(1)
    expect(validate).toHaveBeenCalledWith("hola **mundo** *otra*")
    expect(render).not.toHaveBeenCalled()
    expect(span.textContent).toBe("hola mundo otra")
    expect(span.innerHTML).not.toContain("<strong>")
    expect(span.innerHTML).not.toContain("<em>")
  })

  // -----------------------------------------------------------------------
  // NEW: LinkedBy config
  // -----------------------------------------------------------------------
  it("translates linked elements once per key", async () => {
    const [a, b] = setUpLinkedMain("intro", [
      "Introduction",
      "Introduction",
    ])

    translate.mockResolvedValueOnce("Introduccion")

    const t = makeTranslator(translate, {
      linkedBy: {
        selector: "[data-section-title]",
        keyAttribute: "data-section-title",
      },
    })
    await t.translate("es-ES")

    // Called only once for the group, applied to both
    expectTranslateCalls(translate, "Introduction")
    expect(a.textContent).toBe("Introduccion")
    expect(b.textContent).toBe("Introduccion")
  })

  it("applies outputTransform once per linked logical unit and fans out the transformed write", async () => {
    const [a, b] = setUpLinkedMain("intro", [
      "Introduction",
      "Introduction",
    ])

    const outputTransform = vi.fn((translated: string, context) => {
      expect(context).toEqual({
        kind: "linked",
        targetLang: "es-ES",
        source: "Introduction",
      })
      return `Transformado ${translated}`
    })

    translate.mockResolvedValueOnce("Introduccion")

    const t = makeTranslator(translate, {
      linkedBy: {
        selector: "[data-section-title]",
        keyAttribute: "data-section-title",
      },
      outputTransform,
    })
    await t.translate("es-ES")

    expect(outputTransform).toHaveBeenCalledTimes(1)
    expect(outputTransform.mock.calls[0]?.[0]).toBe("Introduccion")
    expect(outputTransform.mock.calls[0]?.[1]?.attribute).toBeUndefined()
    expect(a.textContent).toBe("Transformado Introduccion")
    expect(b.textContent).toBe("Transformado Introduccion")
  })

  it("counts linked groups as one progress unit per key", async () => {
    setUpLinkedMain("intro", [
      "Introduction",
      "Introduction",
    ])

    translate.mockResolvedValueOnce("Introduccion")

    const onProgress = vi.fn()
    const t = makeTranslator(translate, {
      linkedBy: {
        selector: "[data-section-title]",
        keyAttribute: "data-section-title",
      },
      hooks: { onProgress },
    })
    await t.translate("es-ES")

    expectTranslateCalls(translate, "Introduction")
    expect(onProgress).toHaveBeenCalledTimes(1)
    expect(onProgress).toHaveBeenNthCalledWith(1, 1, 1)
  })

  it("restores linked groups after translate -> translate -> restore", async () => {
    const [a, b] = setUpLinkedMain("intro", [
      "Introduction",
      "Introduction",
    ])

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

    expectTranslateCalls(translate, "Introduction", "Introduction")
    expect(a.textContent).toBe("Apercu")
    expect(b.textContent).toBe("Apercu")

    t.restore()
    expect(a.textContent).toBe("Introduction")
    expect(b.textContent).toBe("Introduction")
  })

  it("treats the current linked text as a new source after restore and DOM mutation", async () => {
    const [a, b] = setUpLinkedMain("intro", [
      "Introduction",
      "Introduction",
    ])

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

    expectTranslateCalls(translate, "Introduction", "Summary")
    expect(a.textContent).toBe("Zusammenfassung")
    expect(b.textContent).toBe("Zusammenfassung")
  })

  it("restores remounted linked nodes from the keyed original source", async () => {
    const [a, b] = setUpLinkedMain("intro", [
      "Introduction",
      "Introduction",
    ])

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

    expectTranslateCalls(translate, "Introduction", "Introduction")
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
    const a = createElement("a", {
      text: "Click me",
      attrs: {
        title: "Go home",
        "aria-label": "Navigate home",
      },
    })
    setUpMain([a])

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
    const a = createElement("a", {
      text: "Click",
      attrs: { title: "Go home" },
    })
    setUpMain([a])

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
    const a = createElement("a", {
      attrs: { title: "Go home" },
    })
    setUpMain([a])

    translate
      .mockResolvedValueOnce("1")
      .mockResolvedValueOnce("Aller a la maison")

    const t = makeTranslator(translate)
    await t.translate("es-ES")
    await t.translate("fr")

    expectTranslateCalls(translate, "Go home", "Go home")
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

    expectTranslateCalls(translate, "Translate me")
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
    const main = setUpMain([{ tag: "p", text: "Hello world content here" }])
    const p = main.querySelector("p")!

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
    const custom = createElement("my-widget", { text: "Skip me" })
    const p = createElement("p", { text: "Translate me" })
    setUpMain([custom, p])

    translate.mockResolvedValueOnce("Traduceme")

    const t = makeTranslator(translate, { skipTags: ["my-widget"] })
    await t.translate("es-ES")

    expectTranslateCalls(translate, "Translate me")
    expect(custom.textContent).toBe("Skip me")
  })
})

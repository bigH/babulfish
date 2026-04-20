import { describe, expect, it } from "vitest"

import {
  isWellFormedMarkdown,
  parseInlineMarkdown,
  renderInlineMarkdownToHtml,
  stripInlineMarkdownMarkers,
} from "../markdown.js"

describe("inline markdown helpers", () => {
  it("keeps parsing and validity checks aligned across representative inputs", () => {
    const cases = [
      {
        source: "plain text",
        valid: true,
        segments: [{ type: "text", content: "plain text" }],
      },
      {
        source: "hello **world**",
        valid: true,
        segments: [
          { type: "text", content: "hello " },
          { type: "strong", content: "world" },
        ],
      },
      {
        source: "hello *world*",
        valid: true,
        segments: [
          { type: "text", content: "hello " },
          { type: "em", content: "world" },
        ],
      },
      {
        source: "a **bold** and *italic*",
        valid: true,
        segments: [
          { type: "text", content: "a " },
          { type: "strong", content: "bold" },
          { type: "text", content: " and " },
          { type: "em", content: "italic" },
        ],
      },
      {
        source: "a *b** c",
        valid: false,
        segments: [
          { type: "text", content: "a " },
          { type: "em", content: "b" },
          { type: "text", content: "* c" },
        ],
      },
      {
        source: "a **b < c",
        valid: false,
        segments: [{ type: "text", content: "a **b < c" }],
      },
    ] as const

    for (const { source, valid, segments } of cases) {
      expect(isWellFormedMarkdown(source)).toBe(valid)
      expect(parseInlineMarkdown(source)).toEqual(segments)
    }
  })

  it("treats unmatched markers as invalid markdown", () => {
    expect(isWellFormedMarkdown("hello *world")).toBe(false)
    expect(isWellFormedMarkdown("hello **world")).toBe(false)
    expect(isWellFormedMarkdown("hello *world*")).toBe(true)
    expect(isWellFormedMarkdown("hello **world**")).toBe(true)
  })

  it("keeps unmatched markers as literal text segments", () => {
    expect(parseInlineMarkdown("hello *world")).toEqual([
      { type: "text", content: "hello *world" },
    ])
    expect(parseInlineMarkdown("hello **world")).toEqual([
      { type: "text", content: "hello **world" },
    ])
  })

  it("parses and renders mixed bold/italic with escaped html content", () => {
    expect(renderInlineMarkdownToHtml("a **b&c** *d<e>*")).toBe(
      "a <strong>b&amp;c</strong> <em>d&lt;e&gt;</em>",
    )
  })

  it("renders unmatched markers as literal text", () => {
    expect(renderInlineMarkdownToHtml("hello *world")).toBe("hello *world")
    expect(renderInlineMarkdownToHtml("hello **world")).toBe("hello **world")
  })

  it("treats mixed unmatched markers as invalid markdown", () => {
    expect(isWellFormedMarkdown("a **b < c")).toBe(false)
    expect(isWellFormedMarkdown("a *b** c")).toBe(false)
    expect(isWellFormedMarkdown("a **bold** and *italic*")).toBe(true)
  })

  it("strips markers for plain-text fallback output", () => {
    expect(stripInlineMarkdownMarkers("hola **mundo** *otra")).toBe("hola mundo otra")
    expect(stripInlineMarkdownMarkers("a *b** c")).toBe("a b c")
  })
})

import { describe, expect, it } from "vitest"

import {
  isWellFormedMarkdown,
  parseInlineMarkdown,
  renderInlineMarkdownToHtml,
} from "../markdown.js"

describe("inline markdown helpers", () => {
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

  it("treats mixed unmatched markers as invalid markdown", () => {
    expect(isWellFormedMarkdown("a **b < c")).toBe(false)
    expect(isWellFormedMarkdown("a *b** c")).toBe(false)
    expect(isWellFormedMarkdown("a **bold** and *italic*")).toBe(true)
  })
})

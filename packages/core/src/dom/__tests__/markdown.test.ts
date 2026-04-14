import { describe, expect, it } from "vitest"

import { isWellFormedMarkdown, parseInlineMarkdown } from "../markdown.js"

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
})

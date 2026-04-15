import { describe, expect, it } from "vitest"
import { applyTranslation, buildBatches, DEFAULT_BATCH_CHAR_LIMIT } from "../batcher.js"
import type { TaggedTextNode } from "../walker.js"

function tagged(node: Text): TaggedTextNode {
  return {
    node,
    text: node.textContent ?? "",
  }
}

describe("buildBatches", () => {
  it("keeps sibling text nodes in one batch when under the same parent", () => {
    const inline = document.createElement("span")
    const first = document.createTextNode("Hello")
    const second = document.createTextNode(" world")
    inline.append(first, second)

    const batches = buildBatches([tagged(first), tagged(second)], DEFAULT_BATCH_CHAR_LIMIT)

    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(2)
  })

  it("splits batches when text nodes cross a parent boundary", () => {
    const root = document.createElement("div")
    const firstWrapper = document.createElement("span")
    const secondWrapper = document.createElement("span")
    const first = document.createTextNode("Hello")
    const second = document.createTextNode("world")

    firstWrapper.appendChild(first)
    secondWrapper.appendChild(second)
    root.append(firstWrapper, secondWrapper)

    const batches = buildBatches([tagged(first), tagged(second)], DEFAULT_BATCH_CHAR_LIMIT)

    expect(batches).toHaveLength(2)
    expect(batches[0]).toEqual([tagged(first)])
    expect(batches[1]).toEqual([tagged(second)])
  })

  it.each([["zero", 0], ["negative", -1], ["infinite", Number.POSITIVE_INFINITY], ["NaN", Number.NaN]])(
    "throws for invalid char limit: %s",
    (_, charLimit) => {
      const node = document.createTextNode("Hello")
      expect(() => buildBatches([tagged(node)], charLimit)).toThrow(RangeError)
    },
  )
})

describe("applyTranslation", () => {
  it("no-ops on empty batch", () => {
    expect(() => {
      applyTranslation([], "translated")
    }).not.toThrow()
  })

  it("writes fallback translation for uneven newline splits", () => {
    const nodeA = document.createTextNode("Hello")
    const nodeB = document.createTextNode("World")
    applyTranslation([tagged(nodeA), tagged(nodeB)], "HelloWorld")

    expect(nodeA.textContent).toBe("HelloWorld")
    expect(nodeB.textContent).toBe("")
  })
})

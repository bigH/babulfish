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

    expect(batches).toEqual([[tagged(first), tagged(second)]])
  })

  it("splits sibling text nodes when the batch would exceed the char limit", () => {
    const inline = document.createElement("span")
    const first = document.createTextNode("Hello")
    const second = document.createTextNode(" world")
    inline.append(first, second)

    const batches = buildBatches([tagged(first), tagged(second)], 10)

    expect(batches).toEqual([[tagged(first)], [tagged(second)]])
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

    expect(batches).toEqual([[tagged(first)], [tagged(second)]])
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
  it("writes each translated line back to its matching text node", () => {
    const nodeA = document.createTextNode("Hello")
    const nodeB = document.createTextNode("World")
    applyTranslation([tagged(nodeA), tagged(nodeB)], "Hola\nMundo")

    expect(nodeA.textContent).toBe("Hola")
    expect(nodeB.textContent).toBe("Mundo")
  })

  it("writes fallback translation for uneven newline splits", () => {
    const nodeA = document.createTextNode("Hello")
    const nodeB = document.createTextNode("World")
    applyTranslation([tagged(nodeA), tagged(nodeB)], "HelloWorld")

    expect(nodeA.textContent).toBe("HelloWorld")
    expect(nodeB.textContent).toBe("")
  })
})

import { describe, expect, it } from "vitest"
import {
  buildSkipTags,
  collectTextNodes,
  defaultShouldSkip,
} from "../walker.js"

describe("collectTextNodes", () => {
  it("skips text nodes inside configured selectors", () => {
    const root = document.createElement("div")
    const normal = document.createElement("p")
    normal.textContent = "Normal text"

    const rich = document.createElement("div")
    rich.setAttribute("data-rich-source", "**bold**")
    rich.innerHTML = "<strong>Bold text</strong>"

    root.append(normal, rich)

    const nodes = collectTextNodes(
      root,
      {
        skipTags: buildSkipTags(),
        shouldSkip: defaultShouldSkip,
        skipInside: ["[data-rich-source]"],
      },
      new WeakMap(),
    )

    expect(nodes.map((node) => node.text)).toEqual(["Normal text"])
  })
})

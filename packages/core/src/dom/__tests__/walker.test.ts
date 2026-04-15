import { describe, expect, it } from "vitest"
import {
  buildSkipTags,
  collectTextNodes,
  defaultShouldSkip,
} from "../walker.js"

describe("collectTextNodes", () => {
  it("normalizes extra skip tags to uppercase", () => {
    const tags = buildSkipTags(["custom-skip", "Code"])
    expect(tags.has("CUSTOM-SKIP")).toBe(true)
    expect(tags.has("CODE")).toBe(true)
  })

  it("returns an isolated default skip-tag set", () => {
    const first = buildSkipTags() as Set<string>
    first.add("CUSTOM")
    const second = buildSkipTags()
    expect(second.has("CUSTOM")).toBe(false)
  })

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

import { describe, expect, it } from "vitest"
import {
  buildSkipTags,
  collectTextNodes,
  defaultShouldSkip,
} from "../walker.js"

describe("buildSkipTags", () => {
  it("normalizes extra skip tags to uppercase", () => {
    const tags = buildSkipTags(["custom-skip", "Code"])
    expect(tags.has("CUSTOM-SKIP")).toBe(true)
    expect(tags.has("CODE")).toBe(true)
  })

  it("returns a fresh set on each call so callers cannot mutate defaults", () => {
    expect(buildSkipTags()).not.toBe(buildSkipTags())
  })
})

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

  it("uses stored original text when a node has already been translated", () => {
    const root = document.createElement("div")
    const paragraph = document.createElement("p")
    const textNode = document.createTextNode("Hello")
    paragraph.appendChild(textNode)
    root.appendChild(paragraph)

    const originalTexts = new WeakMap<Text, string>()
    originalTexts.set(textNode, "Hello")
    textNode.textContent = "Hola"

    const nodes = collectTextNodes(
      root,
      {
        skipTags: buildSkipTags(),
        shouldSkip: defaultShouldSkip,
      },
      originalTexts,
    )

    expect(nodes.map((node) => node.text)).toEqual(["Hello"])
  })
})

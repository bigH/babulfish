import { describe, expect, it } from "vitest"

import { createReadonlyLanguageList, type Language } from "../languages.js"

describe("createReadonlyLanguageList", () => {
  it("clones and deeply freezes the provided language list", () => {
    const configured = [{ label: "Dutch", code: "nl" }]

    const languages = createReadonlyLanguageList(configured)

    expect(languages).toEqual(configured)
    expect(languages).not.toBe(configured)
    expect(languages[0]).not.toBe(configured[0])
    expect(Object.isFrozen(languages)).toBe(true)
    expect(Object.isFrozen(languages[0]!)).toBe(true)

    configured[0]!.label = "Nederlands"

    expect(languages[0]?.label).toBe("Dutch")
    expect(() => {
      ;(languages as Language[]).push({ label: "French", code: "fr" })
    }).toThrow(TypeError)
    expect(() => {
      ;(languages[0] as { label: string }).label = "Nederlands"
    }).toThrow(TypeError)
  })
})

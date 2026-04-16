import { describe, expect, it } from "vitest"

import {
  createReadonlyLanguageList,
  DEFAULT_LANGUAGES,
} from "../languages.js"

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
      ;(languages as { label: string; code: string }[]).push({ label: "French", code: "fr" })
    }).toThrow(TypeError)
    expect(() => {
      ;(languages[0] as { label: string }).label = "Nederlands"
    }).toThrow(TypeError)
  })
})

describe("DEFAULT_LANGUAGES", () => {
  it("uses the same readonly-language contract as configured lists", () => {
    expect(Object.isFrozen(DEFAULT_LANGUAGES)).toBe(true)
    expect(DEFAULT_LANGUAGES.every(Object.isFrozen)).toBe(true)
  })
})

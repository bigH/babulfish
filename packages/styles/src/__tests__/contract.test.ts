import { readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

const cssPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../babulfish.css",
)
const css = readFileSync(cssPath, "utf8")

const CUSTOM_PROPERTIES = [
  "--babulfish-accent",
  "--babulfish-error",
  "--babulfish-border",
  "--babulfish-surface",
  "--babulfish-muted",
] as const

const ANIMATION_CLASSES = [
  ".babulfish-pulse",
  ".babulfish-active",
  ".babulfish-settled",
  ".babulfish-popup",
] as const

describe("@babulfish/styles CSS contract", () => {
  it.each(CUSTOM_PROPERTIES)("documents %s", (property) => {
    expect(css).toContain(`${property}:`)
  })

  it.each(ANIMATION_CLASSES)("ships %s", (className) => {
    expect(css).toContain(className)
  })

  it("inherits generic design-system tokens for themeable defaults", () => {
    expect(css).toContain("--babulfish-accent: var(--accent, #3b82f6);")
    expect(css).toContain("--babulfish-border: var(--border, #e5e7eb);")
    expect(css).toContain("--babulfish-surface: var(--surface, #fff);")
  })

  it("sizes popups to their content instead of the trigger width", () => {
    expect(css).toContain("width: max-content;")
    expect(css).toContain("max-width: calc(100vw - 1rem);")
  })
})

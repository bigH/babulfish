import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const css = readFileSync(new URL("../babulfish.css", import.meta.url), "utf8")

const DECLARATION_CONTRACT = {
  ":root": {
    "--babulfish-accent": "var(--accent, #3b82f6)",
    "--babulfish-error": "rgb(239 68 68)",
    "--babulfish-border": "var(--border, #e5e7eb)",
    "--babulfish-surface": "var(--surface, #fff)",
    "--babulfish-muted": "#9ca3af",
  },
  ".babulfish-pulse": {
    animation: "babulfish-pulse 0.75s ease-in-out infinite",
  },
  ".babulfish-active": {
    animation: "babulfish-active-pulse 0.75s ease-in-out infinite",
  },
  ".babulfish-settled": {
    animation: "babulfish-settle 0.3s ease-out",
  },
  ".babulfish-popup": {
    width: "max-content",
    "max-width": "calc(100vw - 1rem)",
    animation: "babulfish-fade-slide-in 150ms ease-out both",
  },
} as const

const KEYFRAMES = [
  "babulfish-pulse",
  "babulfish-active-pulse",
  "babulfish-settle",
  "babulfish-fade-slide-in",
] as const

function escapeForRegex(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function getBlock(selector: string) {
  const match = css.match(
    new RegExp(`${escapeForRegex(selector)}\\s*\\{([\\s\\S]*?)\\}`),
  )

  if (!match) {
    throw new Error(`Expected CSS block for ${selector}`)
  }

  return match[1]
}

describe("@babulfish/styles CSS contract", () => {
  it.each(Object.entries(DECLARATION_CONTRACT))(
    "ships the documented declarations for %s",
    (selector, declarations) => {
      const block = getBlock(selector)

      for (const [property, value] of Object.entries(declarations)) {
        expect(block).toMatch(
          new RegExp(
            `${escapeForRegex(property)}\\s*:\\s*${escapeForRegex(value)};`,
          ),
        )
      }
    },
  )

  it.each(KEYFRAMES)("ships @keyframes %s", (keyframeName) => {
    expect(css).toContain(`@keyframes ${keyframeName}`)
  })
})

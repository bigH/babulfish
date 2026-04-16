import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const css = readFileSync(new URL("../babulfish.css", import.meta.url), "utf8")

const ROOT_CONTRACT = {
  "--babulfish-accent": "var(--accent, #3b82f6)",
  "--babulfish-error": "rgb(239 68 68)",
  "--babulfish-border": "var(--border, #e5e7eb)",
  "--babulfish-surface": "var(--surface, #fff)",
  "--babulfish-muted": "#9ca3af",
} as const

const SELECTOR_CONTRACT = {
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
  const blockMatcher = new RegExp(
    `${escapeForRegex(selector)}\\s*\\{([\\s\\S]*?)\\}`,
  )
  const match = css.match(blockMatcher)

  expect(match, `Expected CSS block for ${selector}`).toBeTruthy()

  return match?.[1] ?? ""
}

function expectDeclaration(
  block: string,
  property: string,
  value: string,
) {
  const declarationMatcher = new RegExp(
    `${escapeForRegex(property)}\\s*:\\s*${escapeForRegex(value)};`,
  )

  expect(block).toMatch(declarationMatcher)
}

describe("@babulfish/styles CSS contract", () => {
  it("defines the documented root custom properties", () => {
    const rootBlock = getBlock(":root")

    for (const [property, value] of Object.entries(ROOT_CONTRACT)) {
      expectDeclaration(rootBlock, property, value)
    }
  })

  it("ships the documented selector contract", () => {
    for (const [selector, declarations] of Object.entries(SELECTOR_CONTRACT)) {
      const block = getBlock(selector)

      for (const [property, value] of Object.entries(declarations)) {
        expectDeclaration(block, property, value)
      }
    }
  })

  it.each(KEYFRAMES)("ships @keyframes %s", (keyframeName) => {
    expect(css).toContain(`@keyframes ${keyframeName}`)
  })
})

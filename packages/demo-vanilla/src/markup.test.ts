// @vitest-environment jsdom

import { readFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const indexHtmlPath = path.join(packageDir, "index.html")

async function loadIndexHtml(): Promise<void> {
  const html = await readFile(indexHtmlPath, "utf8")
  document.open()
  document.write(html)
  document.close()
}

describe("demo-vanilla markup", () => {
  beforeEach(async () => {
    await loadIndexHtml()
  })

  afterEach(() => {
    document.documentElement.innerHTML = ""
  })

  it("applies the shared surface-card class to the major demo shells", () => {
    expect(document.querySelector(".runtime-controls")?.classList.contains("surface-card")).toBe(true)
    expect(document.querySelector(".toolbar")?.classList.contains("surface-card")).toBe(true)
    expect(document.querySelector("article.panel")?.classList.contains("surface-card")).toBe(true)
    expect(document.querySelector("aside.panel-accent")?.classList.contains("surface-card")).toBe(true)
    expect(document.querySelector("#status")?.classList.contains("surface-card")).toBe(true)
    expect(document.querySelector(".phi4-spike")?.classList.contains("surface-card")).toBe(true)
  })

  it("applies the shared surface-inset class to the proof blocks and spike shells", () => {
    expect(document.querySelector(".structured-proof")?.classList.contains("surface-inset")).toBe(true)
    expect(document.querySelector(".raw-proof")?.classList.contains("surface-inset")).toBe(true)
    expect(document.querySelector(".phi4-status-card")?.classList.contains("surface-inset")).toBe(true)
    expect(document.querySelector(".phi4-output-card")?.classList.contains("surface-inset")).toBe(true)
    expect(document.querySelector(".phi4-log-card")?.classList.contains("surface-inset")).toBe(true)
  })
})

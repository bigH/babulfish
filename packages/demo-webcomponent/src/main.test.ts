import type { Snapshot } from "@babulfish/core"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  appendStatusEntry,
  observeHostDocument,
  requireButton,
  requireEventLog,
  restoreTranslators,
  setTranslatorLanguage,
  type TranslatorHostElement,
} from "./main-helpers.js"

function createSnapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return {
    model: overrides.model ?? { status: "ready" },
    translation: overrides.translation ?? { status: "idle" },
    currentLanguage: overrides.currentLanguage ?? null,
    capabilities: overrides.capabilities ?? {
      ready: true,
      hasWebGPU: true,
      canTranslate: true,
      device: "webgpu",
      isMobile: false,
    },
  }
}

describe("demo main helpers", () => {
  const observers: MutationObserver[] = []

  afterEach(() => {
    for (const observer of observers.splice(0)) observer.disconnect()
    document.body.innerHTML = ""
  })

  it("fails fast when the host page is missing #event-log", () => {
    expect(() => requireEventLog(document)).toThrowError(
      "Expected host page to provide #event-log for demo status output",
    )
  })

  it("fails fast when the host page is missing a required control button", () => {
    expect(() => requireButton(document, "host-restore")).toThrowError(
      "Expected #host-restore button for demo host controls",
    )
  })

  it("returns the requested host control button", () => {
    document.body.innerHTML = `<button id="host-restore" type="button">Restore</button>`

    expect(requireButton(document, "host-restore")).toBeInstanceOf(HTMLButtonElement)
  })

  it("prepends formatted status entries and mirrors them to the console", () => {
    document.body.innerHTML = `<div id="event-log"><div class="entry">older</div></div>`
    const eventLog = requireEventLog(document)
    const logger = { log: vi.fn() }
    const snapshot = createSnapshot({
      model: { status: "downloading", progress: 0.42 },
      translation: { status: "translating", progress: 0.75 },
      currentLanguage: "es",
    })

    appendStatusEntry(eventLog, 1, snapshot, logger)

    const entries = Array.from(eventLog.querySelectorAll(".entry"))
    expect(entries).toHaveLength(2)
    expect(entries[0]?.textContent).toContain("[#2]")
    expect(entries[0]?.textContent).toContain("model=downloading")
    expect(entries[0]?.textContent).toContain("translation=translating")
    expect(entries[0]?.textContent).toContain("lang=es")
    expect(entries[1]?.textContent).toBe("older")
    expect(logger.log).toHaveBeenCalledWith("[babulfish-translator #2]", snapshot)
  })

  it("creates status log entries in the event log's owner document", () => {
    const hostDocument = document.implementation.createHTMLDocument("demo")
    hostDocument.body.innerHTML = `<div id="event-log"></div>`
    const eventLog = requireEventLog(hostDocument)

    appendStatusEntry(eventLog, 0, createSnapshot(), { log: vi.fn() })

    const entry = eventLog.firstElementChild
    expect(entry?.tagName).toBe("DIV")
    expect(entry?.ownerDocument).toBe(hostDocument)
  })

  it("ignores mutations inside #event-log but warns on host document mutations", async () => {
    document.body.innerHTML = `<div id="event-log"></div><div id="outside"></div>`
    const eventLog = requireEventLog(document)
    const logger = { warn: vi.fn() }
    const observer = observeHostDocument(document.body, eventLog, logger)
    observers.push(observer)

    eventLog.append(document.createElement("div"))
    document.getElementById("outside")?.append("changed")
    await Promise.resolve()

    expect(logger.warn).toHaveBeenCalledTimes(1)
    expect(logger.warn).toHaveBeenCalledWith(
      "[host-doc] unexpected mutation outside shadow roots:",
      "childList",
      document.getElementById("outside"),
    )
  })

  it("sets target-lang on every translator host element", () => {
    const first = Object.assign(
      document.createElement("div"),
      { restore: vi.fn() },
    ) as TranslatorHostElement
    const second = Object.assign(
      document.createElement("div"),
      { restore: vi.fn() },
    ) as TranslatorHostElement

    setTranslatorLanguage([first, second], "ar")

    expect(first.getAttribute("target-lang")).toBe("ar")
    expect(second.getAttribute("target-lang")).toBe("ar")
  })

  it("delegates restore() for every translator host element", () => {
    const restoreFirst = vi.fn()
    const restoreSecond = vi.fn()
    const first = Object.assign(
      document.createElement("div"),
      { restore: restoreFirst },
    ) as TranslatorHostElement
    const second = Object.assign(
      document.createElement("div"),
      { restore: restoreSecond },
    ) as TranslatorHostElement

    first.setAttribute("target-lang", "es")
    second.setAttribute("target-lang", "ar")

    restoreTranslators([first, second])

    expect(restoreFirst).toHaveBeenCalledTimes(1)
    expect(restoreSecond).toHaveBeenCalledTimes(1)
  })
})

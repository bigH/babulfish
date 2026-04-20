import type { Snapshot } from "@babulfish/core"

import {
  DEVICE_OPTIONS,
  DTYPE_OPTIONS,
  getDTypeLabel,
  getDeviceLabel,
  type DemoRuntimeSelection,
} from "../../demo-shared/src/runtime-selection.js"

export type TranslatorHostElement = HTMLElement & {
  restore(): void
}

function requireElementById<T extends HTMLElement>(
  doc: Document,
  id: string,
  expected: typeof HTMLElement,
  errorMessage: string,
): T {
  const element = doc.getElementById(id)

  if (!(element instanceof expected)) {
    throw new Error(errorMessage)
  }

  return element as T
}

function requireElement<T extends HTMLElement>(
  root: ParentNode,
  selector: string,
  expected: typeof HTMLElement,
  errorMessage: string,
): T {
  const element = root.querySelector(selector)

  if (!(element instanceof expected)) {
    throw new Error(errorMessage)
  }

  return element as T
}

function formatRequestedRuntimeValue(
  requested: string | null,
  options: readonly { readonly value: string; readonly label: string }[],
  presetDefaultLabel: string,
): string {
  if (!requested) return `${presetDefaultLabel} (preset default)`
  const match = options.find((opt) => opt.value === requested)
  return match ? `${match.label} (${requested})` : requested
}

export function formatRequestedDevice(
  requested: string | null,
  presetDefault: DemoRuntimeSelection["device"],
): string {
  return formatRequestedRuntimeValue(requested, DEVICE_OPTIONS, getDeviceLabel(presetDefault))
}

export function formatRequestedDType(
  requested: string | null,
  presetDefault: DemoRuntimeSelection["dtype"],
): string {
  return formatRequestedRuntimeValue(requested, DTYPE_OPTIONS, getDTypeLabel(presetDefault))
}

export function requireButton(doc: Document, id: string): HTMLButtonElement {
  return requireElementById<HTMLButtonElement>(
    doc,
    id,
    HTMLButtonElement,
    `Expected #${id} button for demo host controls`,
  )
}

export function requireSelect(doc: Document, id: string): HTMLSelectElement {
  return requireElementById<HTMLSelectElement>(
    doc,
    id,
    HTMLSelectElement,
    `Expected #${id} select for host runtime controls`,
  )
}

export function requireStatus(doc: Document, id: string): HTMLElement {
  return requireElementById<HTMLElement>(doc, id, HTMLElement, `Expected #${id} host status element`)
}

export function requireHostControls(doc: Document): HTMLElement {
  return requireElement<HTMLElement>(
    doc,
    ".host-controls",
    HTMLElement,
    'Expected ".host-controls" wrapper for demo host controls',
  )
}

export function requireEventLog(doc: Document): HTMLElement {
  return requireElementById<HTMLElement>(
    doc,
    "event-log",
    HTMLElement,
    "Expected host page to provide #event-log for demo status output",
  )
}

export function appendStatusEntry(
  eventLog: HTMLElement,
  index: number,
  snapshot: Snapshot,
  logger: Pick<Console, "log"> = console,
): void {
  const doc = eventLog.ownerDocument
  const entry = doc.createElement("div")
  entry.className = "entry"

  const label = doc.createElement("span")
  label.className = "label"
  label.textContent = `[#${index + 1}]`
  entry.appendChild(label)

  const probeText =
    snapshot.enablement.probe.status !== "not-run"
      ? ` probe=${snapshot.enablement.probe.status}`
      : ""
  const text = doc.createTextNode(
    ` model=${snapshot.model.status} translation=${snapshot.translation.status} lang=${snapshot.currentLanguage ?? "\u2014"} runtime=${snapshot.enablement.verdict.resolvedDevice ?? "none"} verdict=${snapshot.enablement.verdict.outcome}${probeText}`,
  )
  entry.appendChild(text)

  eventLog.prepend(entry)
  logger.log(`[babulfish-translator #${index + 1}]`, snapshot)
}

export function setTranslatorLanguage(
  translators: readonly TranslatorHostElement[],
  targetLang: string,
): void {
  for (const translator of translators) {
    translator.setAttribute("target-lang", targetLang)
  }
}

export function restoreTranslators(
  translators: readonly TranslatorHostElement[],
): void {
  for (const translator of translators) {
    translator.restore()
  }
}

export function observeHostDocument(
  body: HTMLElement,
  ignoredRoots: readonly HTMLElement[],
  logger: Pick<Console, "warn"> = console,
): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target as Node
      if (ignoredRoots.some((root) => root === target || root.contains(target))) continue
      logger.warn("[host-doc] unexpected mutation outside shadow roots:", mutation.type, target)
    }
  })

  observer.observe(body, { childList: true, subtree: true, characterData: true })
  return observer
}

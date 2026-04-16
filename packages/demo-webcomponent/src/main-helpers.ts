import type { Snapshot } from "@babulfish/core"

export type TranslatorHostElement = HTMLElement & {
  restore(): void
}

export function requireButton(doc: Document, id: string): HTMLButtonElement {
  const button = doc.getElementById(id)

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected #${id} button for demo host controls`)
  }

  return button
}

export function requireEventLog(doc: Document): HTMLElement {
  const eventLog = doc.getElementById("event-log")

  if (!(eventLog instanceof HTMLElement)) {
    throw new Error('Expected host page to provide #event-log for demo status output')
  }

  return eventLog
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

  const text = doc.createTextNode(
    ` model=${snapshot.model.status} translation=${snapshot.translation.status} lang=${snapshot.currentLanguage ?? "\u2014"}`,
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
  eventLog: HTMLElement,
  logger: Pick<Console, "warn"> = console,
): MutationObserver {
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      const target = mutation.target as Node
      if (eventLog.contains(target)) continue
      logger.warn("[host-doc] unexpected mutation outside shadow roots:", mutation.type, target)
    }
  })

  observer.observe(body, { childList: true, subtree: true, characterData: true })
  return observer
}

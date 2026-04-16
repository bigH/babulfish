import "./babulfish-translator.js"
import {
  appendStatusEntry,
  observeHostDocument,
  requireEventLog,
  restoreTranslators,
  setTranslatorLanguage,
  type TranslatorHostElement,
} from "./main-helpers.js"

function requireButton(id: string): HTMLButtonElement {
  const button = document.getElementById(id)
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Expected #${id} button for demo host controls`)
  }
  return button
}

const eventLog = requireEventLog(document)
const translators = Array.from(
  document.querySelectorAll("babulfish-translator"),
) as TranslatorHostElement[]
const translateSpanishButton = requireButton("host-translate-es")
const translateArabicButton = requireButton("host-translate-ar")
const restoreButton = requireButton("host-restore")

translateSpanishButton.addEventListener("click", () => {
  setTranslatorLanguage(translators, "es")
})

translateArabicButton.addEventListener("click", () => {
  setTranslatorLanguage(translators, "ar")
})

restoreButton.addEventListener("click", () => {
  restoreTranslators(translators)
})

translators.forEach((el, i) => {
  el.addEventListener("babulfish-status", (event) => {
    if (!(event instanceof CustomEvent)) return
    appendStatusEntry(eventLog, i, event.detail, console)
  })
})

observeHostDocument(document.body, eventLog, console)

import "./babulfish-translator.js"
import {
  appendStatusEntry,
  observeHostDocument,
  requireButton,
  requireEventLog,
  restoreTranslators,
  setTranslatorLanguage,
  type TranslatorHostElement,
} from "./main-helpers.js"

const eventLog = requireEventLog(document)
const translators = Array.from(
  document.querySelectorAll("babulfish-translator"),
) as TranslatorHostElement[]
const translateSpanishButton = requireButton(document, "host-translate-es")
const translateArabicButton = requireButton(document, "host-translate-ar")
const restoreButton = requireButton(document, "host-restore")

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

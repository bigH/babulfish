import "./babulfish-translator.js"
import { appendStatusEntry, observeHostDocument, requireEventLog } from "./main-helpers.js"

const eventLog = requireEventLog(document)

document.querySelectorAll("babulfish-translator").forEach((el, i) => {
  el.addEventListener("babulfish-status", (event) => {
    if (!(event instanceof CustomEvent)) return
    appendStatusEntry(eventLog, i, event.detail, console)
  })
})

observeHostDocument(document.body, eventLog, console)

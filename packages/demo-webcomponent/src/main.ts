import "./babulfish-translator.js"

const eventLog = document.getElementById("event-log")!

document.querySelectorAll("babulfish-translator").forEach((el, i) => {
  el.addEventListener("babulfish-status", ((e: CustomEvent) => {
    const s = e.detail
    const entry = document.createElement("div")
    entry.className = "entry"

    const label = document.createElement("span")
    label.className = "label"
    label.textContent = `[#${i + 1}]`
    entry.appendChild(label)

    const text = document.createTextNode(
      ` model=${s.model.status} translation=${s.translation.status} lang=${s.currentLanguage ?? "\u2014"}`,
    )
    entry.appendChild(text)

    eventLog.prepend(entry)
    console.log(`[babulfish-translator #${i + 1}]`, s)
  }) as EventListener)
})

const hostObserver = new MutationObserver((mutations) => {
  for (const m of mutations) {
    const target = m.target as Node
    if (eventLog.contains(target)) continue
    console.warn("[host-doc] unexpected mutation outside shadow roots:", m.type, target)
  }
})
hostObserver.observe(document.body, { childList: true, subtree: true, characterData: true })

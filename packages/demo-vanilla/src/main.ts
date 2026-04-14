import { createBabulfish, type Snapshot, DEFAULT_LANGUAGES } from "@babulfish/core"
import "@babulfish/styles/css"

const core = createBabulfish({
  dom: { roots: ["article"] },
})

const $ = <T extends HTMLElement>(id: string): T =>
  document.getElementById(id) as T

const select = $<HTMLSelectElement>("language")
const restoreBtn = $<HTMLButtonElement>("restore")
const loadBtn = $<HTMLButtonElement>("load-model")
const statusModel = $<HTMLElement>("status-model")
const statusTranslation = $<HTMLElement>("status-translation")
const statusLanguage = $<HTMLElement>("status-language")

for (const lang of DEFAULT_LANGUAGES) {
  const opt = document.createElement("option")
  opt.value = lang.code
  opt.textContent = lang.label
  select.appendChild(opt)
}

function render(s: Snapshot): void {
  switch (s.model.status) {
    case "idle":
      statusModel.textContent = "Not loaded"
      break
    case "downloading":
      statusModel.textContent = `Downloading (${Math.round(s.model.progress * 100)}%)`
      break
    case "ready":
      statusModel.textContent = "Ready"
      break
    case "error":
      statusModel.textContent = "Error"
      break
  }

  statusTranslation.textContent =
    s.translation.status === "translating"
      ? `Translating (${Math.round(s.translation.progress * 100)}%)`
      : "Idle"

  statusLanguage.textContent = s.currentLanguage ?? "Original"

  const modelReady = s.model.status === "ready"
  const translating = s.translation.status === "translating"

  select.disabled = !modelReady || translating
  restoreBtn.disabled = !modelReady || s.currentLanguage === null
  loadBtn.disabled = s.model.status !== "idle"
}

render(core.snapshot)
core.subscribe(render)

loadBtn.addEventListener("click", () => {
  core.loadModel()
})

select.addEventListener("change", () => {
  const code = select.value
  if (code) core.translateTo(code)
})

restoreBtn.addEventListener("click", () => {
  core.restore()
  select.value = ""
})

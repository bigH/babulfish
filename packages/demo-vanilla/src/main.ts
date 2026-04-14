import { createBabulfish, type Snapshot } from "@babulfish/core"
import "@babulfish/styles/css"

const core = createBabulfish({
  dom: { roots: ["article"] },
})

function requireElement<T extends typeof HTMLElement>(
  id: string,
  expectedType: T,
): InstanceType<T> {
  const el = document.getElementById(id)
  if (el instanceof expectedType) return el as InstanceType<T>
  throw new Error(`Expected #${id} to be a ${expectedType.name}`)
}

const select = requireElement("language", HTMLSelectElement)
const restoreBtn = requireElement("restore", HTMLButtonElement)
const loadBtn = requireElement("load-model", HTMLButtonElement)
const statusModel = requireElement("status-model", HTMLElement)
const statusTranslation = requireElement("status-translation", HTMLElement)
const statusLanguage = requireElement("status-language", HTMLElement)

for (const lang of core.languages) {
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
  select.value = s.currentLanguage ?? ""

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
})

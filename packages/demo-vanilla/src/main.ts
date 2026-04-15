import { createBabulfish, type Snapshot } from "@babulfish/core"
import "@babulfish/styles/css"

const core = createBabulfish({
  dom: { roots: ["article"] },
})

function requireElement<T extends new (...args: any[]) => HTMLElement>(
  id: string,
  expectedType: T,
): InstanceType<T> {
  const el = document.getElementById(id)
  if (el === null) {
    throw new Error(`Expected #${id} to exist`)
  }
  if (!(el instanceof expectedType)) {
    throw new Error(`Expected #${id} to be a ${expectedType.name}`)
  }
  return el as InstanceType<T>
}

function toPercent(progress: number): string {
  return `${Math.round(progress * 100)}%`
}

function modelStatusText(model: Snapshot["model"]): string {
  switch (model.status) {
    case "idle":
      return "Not loaded"
    case "downloading":
      return `Downloading (${toPercent(model.progress)})`
    case "ready":
      return "Ready"
    case "error":
      return "Error"
  }
}

function translationStatusText(translation: Snapshot["translation"]): string {
  switch (translation.status) {
    case "idle":
      return "Idle"
    case "translating":
      return `Translating (${toPercent(translation.progress)})`
  }
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
  statusModel.textContent = modelStatusText(s.model)
  statusTranslation.textContent = translationStatusText(s.translation)

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

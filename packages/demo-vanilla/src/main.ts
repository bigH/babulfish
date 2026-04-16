import { createBabulfish, type Snapshot } from "@babulfish/core"
import "@babulfish/styles/css"

const STRUCTURED_SOURCE = [
  "Structured text keeps inline emphasis, links, and line breaks",
  "while code stays opaque.",
].join("\n")
const STRUCTURED_DOM_SUFFIX = " [dom-structured]"
const DEMO_ROOTS = [
  { label: "copy", selector: "[data-demo-copy]" },
  { label: "aside", selector: "[data-demo-aside]" },
] as const

const core = createBabulfish({
  dom: {
    roots: DEMO_ROOTS.map(({ selector }) => selector),
    structuredText: { selector: "[data-structured]" },
    preserve: {
      matchers: ["babulfish", "TranslateGemma", "WebGPU"],
    },
    shouldSkip: (text, defaultSkip) => defaultSkip(text) || text.startsWith("SKU-"),
    outputTransform: (translated, context) => (
      context.kind === "structuredText"
        ? `${translated}${STRUCTURED_DOM_SUFFIX}`
        : translated
    ),
  },
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

function requireRoot(selector: string): HTMLElement {
  const root = document.querySelector<HTMLElement>(selector)
  if (root === null) {
    throw new Error(`Expected demo root ${selector} to exist`)
  }
  return root
}

function toPercent(progress: number): string {
  return `${Math.round(progress * 100)}%`
}

const translatedRoots = DEMO_ROOTS.map(({ label, selector }) => ({
  label,
  root: requireRoot(selector),
}))

function formatDirections(): string {
  return translatedRoots
    .map(({ label, root }) => `${label}: ${root.getAttribute("dir") ?? "none"}`)
    .join(" / ")
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
const statusDirection = requireElement("status-direction", HTMLElement)
const translateTextBtn = requireElement("translate-text", HTMLButtonElement)
const statusRawText = requireElement("status-raw-text", HTMLOutputElement)

for (const lang of core.languages) {
  const opt = document.createElement("option")
  opt.value = lang.code
  opt.textContent = lang.label
  select.appendChild(opt)
}

function resetRawTextProof(): void {
  statusRawText.textContent = "Not run"
}

function render(s: Snapshot): void {
  statusModel.textContent = modelStatusText(s.model)
  statusTranslation.textContent = translationStatusText(s.translation)
  statusLanguage.textContent = s.currentLanguage ?? "Original"
  statusDirection.textContent = formatDirections()
  select.value = s.currentLanguage ?? ""

  const modelReady = s.model.status === "ready"
  const translating = s.translation.status === "translating"

  select.disabled = !modelReady || translating
  restoreBtn.disabled = !modelReady || s.currentLanguage === null
  loadBtn.disabled = s.model.status !== "idle"
  translateTextBtn.disabled = !modelReady || translating || (s.currentLanguage ?? "") === ""
}

render(core.snapshot)
core.subscribe(render)

loadBtn.addEventListener("click", () => {
  void core.loadModel()
})

select.addEventListener("change", () => {
  const code = select.value
  resetRawTextProof()
  if (!code) {
    core.restore()
    return
  }

  void core.translateTo(code)
})

restoreBtn.addEventListener("click", () => {
  core.restore()
  resetRawTextProof()
})

translateTextBtn.addEventListener("click", async () => {
  const targetLang = core.snapshot.currentLanguage
  if (!targetLang) return

  statusRawText.textContent = "Running raw translateText()..."
  const translated = await core.translateText(STRUCTURED_SOURCE, targetLang)
  statusRawText.textContent = translated
})

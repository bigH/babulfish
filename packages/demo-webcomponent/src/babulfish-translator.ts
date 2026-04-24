import { createBabulfish, type BabulfishCore, type Snapshot } from "@babulfish/core"

import {
  createDemoRuntimeSelectionKey,
  resolveDemoRuntimeSelection,
  toBabulfishEngineConfig,
  type ResolvedDemoRuntimeSelection,
} from "../../demo-shared/src/runtime-selection.js"

const STYLES = /* css */ `
:host {
  display: block;
  border: 1px solid var(--babulfish-border, #e5e7eb);
  border-radius: 8px;
  padding: 1.25rem;
  font-family: system-ui, -apple-system, sans-serif;
  color: #1a1a1a;
  line-height: 1.6;
  --babulfish-accent: var(--accent, #3b82f6);
  --babulfish-error: rgb(239 68 68);
  --babulfish-border: var(--border, #e5e7eb);
  --babulfish-surface: var(--surface, #fff);
}

*, *::before, *::after { box-sizing: border-box; margin: 0; }

.toolbar {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  margin-bottom: 1rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--babulfish-border, #e5e7eb);
}

select, button {
  font: inherit;
  font-size: 0.875rem;
  padding: 0.4rem 0.75rem;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  background: var(--babulfish-surface, #fff);
  cursor: pointer;
}
select:disabled, button:disabled { opacity: 0.5; cursor: not-allowed; }
button:not(:disabled):hover { background: #f9fafb; }

.load-model {
  margin-left: auto;
  background: var(--babulfish-accent, #3b82f6);
  color: #fff;
  border-color: var(--babulfish-accent, #3b82f6);
}
.load-model:not(:disabled):hover { background: #2563eb; }
.load-model:disabled { background: #93c5fd; border-color: #93c5fd; }

.content p { margin-bottom: 0.75rem; color: #374151; }
.content strong { color: #111827; }

.status {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--babulfish-border, #e5e7eb);
}
.status-text { font-size: 0.8rem; color: #6b7280; }
`

function buildTemplate(): HTMLTemplateElement {
  const tmpl = document.createElement("template")
  tmpl.innerHTML = [
    `<style>${STYLES}</style>`,
    `<div class="toolbar">`,
    `  <select class="language" disabled>`,
    `    <option value="">Choose language\u2026</option>`,
    `  </select>`,
    `  <button class="restore" type="button" disabled>Original</button>`,
    `  <button class="load-model" type="button">Load Model</button>`,
    `</div>`,
    `<div class="content">`,
    `  <p><strong>Shadow-root content.</strong> These paragraphs live entirely inside the custom element.</p>`,
    `  <p>`,
    `    The translation engine modifies only this shadow tree while the host page`,
    `    stays untouched and just listens for lifecycle events.`,
    `  </p>`,
    `  <p>Use the host buttons after loading once to drive target-lang and restore().</p>`,
    `</div>`,
    `<div class="status">`,
    `  <span class="status-text">Model: Not loaded</span>`,
    `</div>`,
  ].join("\n")
  return tmpl
}

type ShadowElements = {
  readonly select: HTMLSelectElement
  readonly restore: HTMLButtonElement
  readonly loadModel: HTMLButtonElement
  readonly status: HTMLElement
}

export class BabulfishTranslator extends HTMLElement {
  #core: BabulfishCore | null = null
  #unsubscribe: (() => void) | null = null
  #els: ShadowElements | null = null
  #runtimeState: ResolvedDemoRuntimeSelection | null = null
  #runtimeKey: string | null = null

  static get observedAttributes(): readonly string[] {
    return ["target-lang", "device", "model", "model-id", "dtype"]
  }

  connectedCallback(): void {
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" })
    const needsInitialRender = this.#els === null

    if (needsInitialRender) {
      shadow.replaceChildren(buildTemplate().content.cloneNode(true))
      this.#els = {
        select: shadow.querySelector(".language") as HTMLSelectElement,
        restore: shadow.querySelector(".restore") as HTMLButtonElement,
        loadModel: shadow.querySelector(".load-model") as HTMLButtonElement,
        status: shadow.querySelector(".status-text") as HTMLElement,
      }
      this.#wireControls()
    }

    this.#mountCore(shadow)

    if (needsInitialRender) this.#populateLanguages()
  }

  disconnectedCallback(): void {
    this.#teardownCore()
    this.#els = null
  }

  attributeChangedCallback(name: string, oldValue: string | null, value: string | null): void {
    if (oldValue === value || !this.isConnected) return

    if (name === "target-lang") {
      if (!value || !this.#core) return
      if (this.#core.snapshot.model.status !== "ready") return
      void this.#core.translateTo(value)
      return
    }

    this.#remountCoreOnRuntimeChange(this.shadowRoot ?? this.attachShadow({ mode: "open" }))
  }

  restore(): void {
    this.removeAttribute("target-lang")
    this.#core?.restore()
    if (this.#els) this.#els.select.value = ""
  }

  #readRuntimeState(): ResolvedDemoRuntimeSelection {
    return resolveDemoRuntimeSelection({
      device: this.getAttribute("device"),
      model: this.getAttribute("model"),
      modelId: this.getAttribute("model-id"),
      dtype: this.getAttribute("dtype"),
    })
  }

  #mountCore(
    shadow: ShadowRoot,
    runtimeState: ResolvedDemoRuntimeSelection = this.#readRuntimeState(),
  ): void {
    this.#teardownCore()
    this.#runtimeState = runtimeState
    this.#runtimeKey = createDemoRuntimeSelectionKey(runtimeState.selection)
    this.#core = createBabulfish({
      engine: toBabulfishEngineConfig(runtimeState.selection),
      dom: { root: shadow, roots: [".content"] },
    })

    this.#unsubscribe = this.#core.subscribe((snapshot) => {
      this.dispatchEvent(
        new CustomEvent("babulfish-status", {
          detail: snapshot,
          bubbles: true,
          composed: true,
        }),
      )
      this.#render(snapshot)
    })

    this.#render(this.#core.snapshot)
  }

  #remountCoreOnRuntimeChange(shadow: ShadowRoot): void {
    const nextRuntimeState = this.#readRuntimeState()
    const nextRuntimeKey = createDemoRuntimeSelectionKey(nextRuntimeState.selection)

    if (this.#runtimeKey === nextRuntimeKey) {
      this.#runtimeState = nextRuntimeState
      if (this.#core) this.#render(this.#core.snapshot)
      return
    }

    this.removeAttribute("target-lang")
    this.#mountCore(shadow, nextRuntimeState)
  }

  #populateLanguages(): void {
    if (!this.#els || !this.#core) return
    for (const lang of this.#core.languages) {
      const opt = document.createElement("option")
      opt.value = lang.code
      opt.textContent = lang.label
      this.#els.select.appendChild(opt)
    }
  }

  #teardownCore(): void {
    this.#unsubscribe?.()
    this.#unsubscribe = null

    if (!this.#core) {
      this.#runtimeKey = null
      return
    }

    this.#core.abort()
    this.#core.restore()
    void this.#core.dispose().catch(() => {})
    this.#core = null
    this.#runtimeKey = null
  }

  #render(snapshot: Snapshot): void {
    if (!this.#els || !this.#runtimeState) return

    let modelText: string
    switch (snapshot.model.status) {
      case "idle":
        modelText = "Not loaded"
        break
      case "downloading":
        modelText = `Downloading (${Math.round(snapshot.model.progress * 100)}%)`
        break
      case "ready":
        modelText = "Ready"
        break
      case "error":
        modelText = "Error"
        break
    }

    const translationText =
      snapshot.translation.status === "translating"
        ? ` | Translating (${Math.round(snapshot.translation.progress * 100)}%)`
        : ""
    const languageText = snapshot.currentLanguage ? ` | ${snapshot.currentLanguage}` : ""
    const selection = this.#runtimeState.selection
    const requestedModel =
      this.#runtimeState.requested.model ??
      this.#runtimeState.requested.modelId ??
      `${this.#runtimeState.preset.id} (default)`
    const requestedDevice =
      this.#runtimeState.requested.device ??
      `${this.#runtimeState.preset.defaultDevice} (default)`
    const requestedText =
      ` | requested model ${requestedModel}` +
      ` | spec ${selection.model.id}` +
      ` | resolved model ${selection.model.resolvedModelId}` +
      ` | adapter ${selection.model.adapterId}` +
      ` | dtype ${selection.dtype}` +
      ` | requested device ${requestedDevice}` +
      ` | effective device ${selection.device}`
    const resolvedText =
      ` | resolved device ${snapshot.enablement.verdict.resolvedDevice ?? "none"}`
    const probeText =
      snapshot.enablement.probe.status !== "not-run"
        ? ` | probe: ${snapshot.enablement.probe.status}`
        : ""

    this.#els.status.textContent =
      `Model: ${modelText}${translationText}${languageText}${requestedText}${resolvedText}${probeText}`
    this.#els.select.value = snapshot.currentLanguage ?? ""

    const modelReady = snapshot.model.status === "ready"
    const translating = snapshot.translation.status === "translating"
    this.#els.select.disabled = !modelReady || translating
    this.#els.restore.disabled = !modelReady || snapshot.currentLanguage === null
    this.#els.loadModel.disabled = snapshot.model.status !== "idle"
  }

  #wireControls(): void {
    if (!this.#els) return

    this.#els.loadModel.addEventListener("click", () => {
      void this.#core?.loadModel()
    })

    this.#els.select.addEventListener("change", () => {
      const code = this.#els?.select.value
      if (code) {
        this.setAttribute("target-lang", code)
        return
      }

      this.restore()
    })

    this.#els.restore.addEventListener("click", () => this.restore())
  }
}

customElements.define("babulfish-translator", BabulfishTranslator)

declare global {
  interface HTMLElementTagNameMap {
    "babulfish-translator": BabulfishTranslator
  }
}

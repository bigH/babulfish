import { createBabulfish, type BabulfishCore, type Snapshot } from "@babulfish/core"

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

@keyframes babulfish-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.2; }
}
.babulfish-pulse { animation: babulfish-pulse 0.75s ease-in-out infinite; }

@keyframes babulfish-active-pulse {
  0%, 100% {
    border-color: rgb(239 68 68 / 0.5);
    box-shadow: 0 0 8px rgb(239 68 68 / 0.25);
  }
  50% {
    border-color: var(--babulfish-error);
    box-shadow: 0 0 14px rgb(239 68 68 / 0.45);
  }
}
.babulfish-active { animation: babulfish-active-pulse 0.75s ease-in-out infinite; }

@keyframes babulfish-settle {
  from { clip-path: inset(0 100% 0 0); }
  to { clip-path: inset(0 0 0 0); }
}
.babulfish-settled { animation: babulfish-settle 0.3s ease-out; }

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
    `  <p>`,
    `    This paragraph lives inside a Shadow DOM boundary. The translation engine`,
    `    modifies only this shadow tree \u2014 the host document remains untouched.`,
    `  </p>`,
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

  static get observedAttributes(): readonly string[] {
    return ["target-lang"]
  }

  connectedCallback(): void {
    const shadow = this.shadowRoot ?? this.attachShadow({ mode: "open" })
    shadow.replaceChildren(buildTemplate().content.cloneNode(true))

    this.#els = {
      select: shadow.querySelector(".language") as HTMLSelectElement,
      restore: shadow.querySelector(".restore") as HTMLButtonElement,
      loadModel: shadow.querySelector(".load-model") as HTMLButtonElement,
      status: shadow.querySelector(".status-text") as HTMLElement,
    }

    this.#core = createBabulfish({
      dom: { root: shadow, roots: [".content"] },
    })

    for (const lang of this.#core.languages) {
      const opt = document.createElement("option")
      opt.value = lang.code
      opt.textContent = lang.label
      this.#els.select.appendChild(opt)
    }

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
    this.#wireControls()
  }

  disconnectedCallback(): void {
    this.#unsubscribe?.()
    this.#unsubscribe = null
    this.#core?.dispose()
    this.#core = null
    this.#els = null
  }

  attributeChangedCallback(_name: string, _old: string | null, value: string | null): void {
    if (value && this.#core) this.#core.translateTo(value)
  }

  restore(): void {
    this.#core?.restore()
    if (this.#els) this.#els.select.value = ""
  }

  #render(s: Snapshot): void {
    if (!this.#els) return

    let modelText: string
    switch (s.model.status) {
      case "idle":
        modelText = "Not loaded"
        break
      case "downloading":
        modelText = `Downloading (${Math.round(s.model.progress * 100)}%)`
        break
      case "ready":
        modelText = "Ready"
        break
      case "error":
        modelText = "Error"
        break
    }

    const transText =
      s.translation.status === "translating"
        ? ` | Translating (${Math.round(s.translation.progress * 100)}%)`
        : ""

    const langText = s.currentLanguage ? ` | ${s.currentLanguage}` : ""
    this.#els.status.textContent = `Model: ${modelText}${transText}${langText}`

    const modelReady = s.model.status === "ready"
    const translating = s.translation.status === "translating"
    this.#els.select.disabled = !modelReady || translating
    this.#els.restore.disabled = !modelReady || s.currentLanguage === null
    this.#els.loadModel.disabled = s.model.status !== "idle"
  }

  #wireControls(): void {
    if (!this.#els) return

    this.#els.loadModel.addEventListener("click", () => this.#core?.loadModel())

    this.#els.select.addEventListener("change", () => {
      const code = this.#els?.select.value
      if (code) this.#core?.translateTo(code)
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

/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react"
import { hydrateRoot } from "react-dom/client"
import { renderToString } from "react-dom/server"

// ---------------------------------------------------------------------------
// Mocks — must be declared before imports that use them
// ---------------------------------------------------------------------------

// Engine mock
const mockLoad = vi.fn<() => Promise<void>>()
const mockTranslate = vi.fn<(text: string, lang: string) => Promise<string>>()
const mockDispose = vi.fn()
const mockOn = vi.fn<
  (event: string, handler: (data: unknown) => void) => () => void
>()
let mockEngineStatus = "idle"

vi.mock("../../engine/index.js", () => ({
  createEngine: () => ({
    load: (...args: unknown[]) => mockLoad(...(args as [])),
    translate: (text: string, lang: string) => mockTranslate(text, lang),
    dispose: () => mockDispose(),
    on: (event: string, handler: (data: unknown) => void) =>
      mockOn(event, handler),
    get status() {
      return mockEngineStatus
    },
  }),
}))

// DOM translator mock
const mockDOMTranslate = vi.fn<(lang: string) => Promise<void>>()
const mockDOMRestore = vi.fn()
const mockDOMAbort = vi.fn()
let mockDOMIsTranslating = false
let mockDOMCurrentLang: string | null = null

vi.mock("../../dom/index.js", () => ({
  createDOMTranslator: () => ({
    translate: (lang: string) => mockDOMTranslate(lang),
    restore: () => mockDOMRestore(),
    abort: () => mockDOMAbort(),
    get isTranslating() {
      return mockDOMIsTranslating
    },
    get currentLang() {
      return mockDOMCurrentLang
    },
  }),
}))

// Detect mock
vi.mock("../../engine/detect.js", () => ({
  isWebGPUAvailable: () => mockIsWebGPUAvailable(),
  isMobileDevice: () => mockIsMobileDevice(),
}))

const mockIsWebGPUAvailable = vi.fn(() => true)
const mockIsMobileDevice = vi.fn(() => false)

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { TranslatorProvider } from "../provider.js"
import { useTranslator } from "../use-translator.js"
import { useTranslateDOM } from "../use-translate-dom.js"
import { TranslateButton } from "../translate-button.js"
import { TranslateDropdown } from "../translate-dropdown.js"
import { DEFAULT_LANGUAGES } from "../provider.js"
import type { TranslatorConfig } from "../provider.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOM_CONFIG: TranslatorConfig = {
  dom: { roots: ["main"] },
}

function clickOutside() {
  fireEvent.mouseDown(document.body)
}

/** Wrapper that provides the TranslatorProvider */
function Wrapper({
  config,
  children,
}: {
  config?: TranslatorConfig
  children: React.ReactNode
}) {
  return <TranslatorProvider config={config}>{children}</TranslatorProvider>
}

/** Test component that exposes useTranslator state */
function HookInspector() {
  const state = useTranslator()
  return (
    <div>
      <span data-testid="model-status">{state.model.status}</span>
      <span data-testid="translation-status">{state.translation.status}</span>
      <span data-testid="current-language">{state.currentLanguage ?? "none"}</span>
      <span data-testid="capabilities-ready">{String(state.capabilitiesReady)}</span>
      <span data-testid="is-supported">{String(state.isSupported)}</span>
      <span data-testid="is-mobile">{String(state.isMobile)}</span>
      <span data-testid="language-count">{state.languages.length}</span>
      <button data-testid="load" onClick={() => state.loadModel()}>Load</button>
      <button data-testid="translate-to" onClick={() => state.translateTo("es-ES")}>Translate</button>
      <button data-testid="restore" onClick={() => state.restore()}>Restore</button>
    </div>
  )
}

/** Test component that exposes useTranslateDOM state */
function DOMHookInspector() {
  const { translatePage, restorePage, progress } = useTranslateDOM()
  return (
    <div>
      <span data-testid="dom-progress">{progress === null ? "null" : String(progress)}</span>
      <button data-testid="dom-translate" onClick={() => translatePage("fr")}>Translate</button>
      <button data-testid="dom-restore" onClick={() => restorePage()}>Restore</button>
    </div>
  )
}

function CapabilitySnapshotProbe() {
  const { capabilitiesReady, isSupported, isMobile } = useTranslator()
  return (
    <output data-testid="capabilities-probe">
      {JSON.stringify({
        capabilitiesReady,
        isSupported,
        isMobile,
      })}
    </output>
  )
}

// Set up mockOn to return an unsubscribe fn by default
function setupMockOn() {
  mockOn.mockImplementation(() => () => {})
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TranslatorProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEngineStatus = "idle"
    mockDOMIsTranslating = false
    mockDOMCurrentLang = null
    mockIsWebGPUAvailable.mockReturnValue(true)
    mockIsMobileDevice.mockReturnValue(false)
    mockLoad.mockResolvedValue(undefined)
    mockTranslate.mockResolvedValue("translated")
    mockDOMTranslate.mockResolvedValue(undefined)
    setupMockOn()
  })

  afterEach(cleanup)

  it("renders children", () => {
    render(
      <TranslatorProvider>
        <span data-testid="child">hello</span>
      </TranslatorProvider>,
    )
    expect(screen.getByTestId("child")).toHaveTextContent("hello")
  })

  it("throws when hook used outside provider", () => {
    // Suppress React error boundary output
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(() => render(<HookInspector />)).toThrow(
      "useTranslator must be used within <TranslatorProvider>",
    )
    spy.mockRestore()
  })

  it("provides default languages when none specified", () => {
    render(
      <Wrapper>
        <HookInspector />
      </Wrapper>,
    )
    expect(screen.getByTestId("language-count")).toHaveTextContent(
      String(DEFAULT_LANGUAGES.length),
    )
  })
})

describe("useTranslator", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEngineStatus = "idle"
    mockDOMIsTranslating = false
    mockDOMCurrentLang = null
    mockIsWebGPUAvailable.mockReturnValue(true)
    mockIsMobileDevice.mockReturnValue(false)
    mockLoad.mockResolvedValue(undefined)
    mockTranslate.mockResolvedValue("translated")
    mockDOMTranslate.mockResolvedValue(undefined)
    setupMockOn()
  })

  afterEach(cleanup)

  it("returns correct initial state", () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <HookInspector />
      </Wrapper>,
    )

    expect(screen.getByTestId("model-status")).toHaveTextContent("idle")
    expect(screen.getByTestId("translation-status")).toHaveTextContent("idle")
    expect(screen.getByTestId("current-language")).toHaveTextContent("none")
    expect(screen.getByTestId("capabilities-ready")).toHaveTextContent("true")
    expect(screen.getByTestId("is-supported")).toHaveTextContent("true")
    expect(screen.getByTestId("is-mobile")).toHaveTextContent("false")
  })

  it("reports isSupported=false when WebGPU unavailable", () => {
    mockIsWebGPUAvailable.mockReturnValue(false)
    render(
      <Wrapper config={DOM_CONFIG}>
        <HookInspector />
      </Wrapper>,
    )
    expect(screen.getByTestId("is-supported")).toHaveTextContent("false")
  })

  it("reports isMobile=true on mobile device", () => {
    mockIsMobileDevice.mockReturnValue(true)
    render(
      <Wrapper config={DOM_CONFIG}>
        <HookInspector />
      </Wrapper>,
    )
    expect(screen.getByTestId("is-mobile")).toHaveTextContent("true")
  })

  it("keeps capability state neutral through hydration, then resolves browser capabilities", async () => {
    const serverHtml = renderToString(
      <Wrapper config={DOM_CONFIG}>
        <CapabilitySnapshotProbe />
      </Wrapper>,
    )

    expect(mockIsWebGPUAvailable).not.toHaveBeenCalled()
    expect(mockIsMobileDevice).not.toHaveBeenCalled()
    expect(serverHtml).toContain("&quot;capabilitiesReady&quot;:false")
    expect(serverHtml).toContain("&quot;isSupported&quot;:false")
    expect(serverHtml).toContain("&quot;isMobile&quot;:false")

    const container = document.createElement("div")
    container.innerHTML = serverHtml
    document.body.append(container)

    const recoverableError = vi.fn()

    const root = hydrateRoot(
      container,
      <Wrapper config={DOM_CONFIG}>
        <CapabilitySnapshotProbe />
      </Wrapper>,
      { onRecoverableError: recoverableError },
    )

    expect(container.textContent).toContain("\"capabilitiesReady\":false")
    expect(container.textContent).toContain("\"isSupported\":false")
    expect(container.textContent).toContain("\"isMobile\":false")
    expect(mockIsWebGPUAvailable).not.toHaveBeenCalled()
    expect(mockIsMobileDevice).not.toHaveBeenCalled()

    await act(async () => {
      await Promise.resolve()
    })

    expect(recoverableError).not.toHaveBeenCalled()
    expect(mockIsWebGPUAvailable).toHaveBeenCalledTimes(1)
    expect(mockIsMobileDevice).toHaveBeenCalledTimes(1)
    expect(container.textContent).toContain("\"capabilitiesReady\":true")
    expect(container.textContent).toContain("\"isSupported\":true")
    expect(container.textContent).toContain("\"isMobile\":false")

    await act(async () => {
      root.unmount()
    })
    container.remove()
  })

  it("calls engine.load on loadModel", async () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <HookInspector />
      </Wrapper>,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId("load"))
    })

    expect(mockLoad).toHaveBeenCalledTimes(1)
  })

  it("calls domTranslator.restore on restore", () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <HookInspector />
      </Wrapper>,
    )

    fireEvent.click(screen.getByTestId("restore"))
    expect(mockDOMRestore).toHaveBeenCalledTimes(1)
  })
})

describe("TranslateButton", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEngineStatus = "idle"
    mockDOMIsTranslating = false
    mockDOMCurrentLang = null
    mockIsWebGPUAvailable.mockReturnValue(true)
    mockIsMobileDevice.mockReturnValue(false)
    mockLoad.mockResolvedValue(undefined)
    mockTranslate.mockResolvedValue("translated")
    mockDOMTranslate.mockResolvedValue(undefined)
    setupMockOn()
  })

  afterEach(cleanup)

  it("shows explainer tooltip on hover", () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    const button = screen.getByRole("button")
    fireEvent.mouseEnter(button)

    expect(screen.getByRole("tooltip")).toBeInTheDocument()
    expect(screen.getByText(/never phones home/i)).toBeInTheDocument()
  })

  it("shows confirm tooltip on first click", () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    fireEvent.click(screen.getByRole("button"))

    expect(screen.getByRole("tooltip")).toBeInTheDocument()
    expect(screen.getByText(/click again to confirm/i)).toBeInTheDocument()
    expect(screen.getByText(/2\.9 GB/i)).toBeInTheDocument()
  })

  it("dismisses confirm tooltip on click outside", () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("tooltip")).toBeInTheDocument()

    clickOutside()
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("dismisses confirm tooltip on Escape key", () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    fireEvent.click(screen.getByRole("button"))
    expect(screen.getByRole("tooltip")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
  })

  it("starts download on confirm click", async () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    const button = screen.getByRole("button")

    // IDLE -> CONFIRM
    fireEvent.click(button)

    // CONFIRM -> DOWNLOADING
    await act(async () => {
      fireEvent.click(button)
    })

    expect(mockLoad).toHaveBeenCalledTimes(1)
  })

  it("shows language dropdown when button clicked in ready state", async () => {
    // Simulate engine going straight to ready
    let statusHandler: ((data: { from: string; to: string }) => void) | null = null
    mockOn.mockImplementation((event, handler) => {
      if (event === "status-change") {
        statusHandler = handler as (data: { from: string; to: string }) => void
      }
      return () => {}
    })
    mockLoad.mockImplementation(async () => {
      mockEngineStatus = "ready"
      statusHandler?.({ from: "downloading", to: "ready" })
    })

    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    const button = screen.getByRole("button")

    // IDLE -> CONFIRM -> DOWNLOADING -> READY
    fireEvent.click(button)
    await act(async () => {
      fireEvent.click(button)
    })

    // READY -> open dropdown
    fireEvent.click(button)
    expect(screen.getByRole("listbox")).toBeInTheDocument()
    expect(screen.getByText("Spanish")).toBeInTheDocument()
    expect(screen.getByText("French")).toBeInTheDocument()
  })

  it("shows mobile message on mobile device", () => {
    mockIsMobileDevice.mockReturnValue(true)

    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    fireEvent.click(screen.getByRole("button"))
    expect(
      screen.getByText(/requires a desktop browser/i),
    ).toBeInTheDocument()
  })

  it("does not render when WebGPU is unavailable on desktop", () => {
    mockIsWebGPUAvailable.mockReturnValue(false)
    mockIsMobileDevice.mockReturnValue(false)

    const { container } = render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    expect(container.querySelector("button")).toBeNull()
  })
})

describe("TranslateDropdown", () => {
  const testLanguages = [
    { label: "English (Original)", code: "restore" },
    { label: "Spanish", code: "es-ES" },
    { label: "French", code: "fr" },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    mockEngineStatus = "idle"
    setupMockOn()
  })

  afterEach(cleanup)

  it("renders all languages", () => {
    render(
      <Wrapper>
        <TranslateDropdown
          onSelect={() => {}}
          languages={testLanguages}
        />
      </Wrapper>,
    )

    expect(screen.getByText("English (Original)")).toBeInTheDocument()
    expect(screen.getByText("Spanish")).toBeInTheDocument()
    expect(screen.getByText("French")).toBeInTheDocument()
  })

  it("calls onSelect with correct code", () => {
    const onSelect = vi.fn()
    render(
      <Wrapper>
        <TranslateDropdown
          onSelect={onSelect}
          languages={testLanguages}
        />
      </Wrapper>,
    )

    fireEvent.click(screen.getByText("Spanish"))
    expect(onSelect).toHaveBeenCalledWith("es-ES")
  })

  it("marks active language", () => {
    render(
      <Wrapper>
        <TranslateDropdown
          onSelect={() => {}}
          value="es-ES"
          languages={testLanguages}
        />
      </Wrapper>,
    )

    const options = screen.getAllByRole("option")
    const spanish = options.find((el) => el.textContent?.includes("Spanish"))
    expect(spanish).toHaveAttribute("aria-selected", "true")
  })

  it("applies disabled styling", () => {
    render(
      <Wrapper>
        <TranslateDropdown
          onSelect={() => {}}
          disabled
          languages={testLanguages}
        />
      </Wrapper>,
    )

    const listbox = screen.getByRole("listbox")
    expect(listbox.style.pointerEvents).toBe("none")
    expect(listbox.style.opacity).toBe("0.5")
  })

  it("uses custom renderOption", () => {
    render(
      <Wrapper>
        <TranslateDropdown
          onSelect={() => {}}
          languages={testLanguages}
          renderOption={(lang, active) => (
            <span data-testid={`custom-${lang.code}`}>
              {lang.label} {active ? "(active)" : ""}
            </span>
          )}
          value="fr"
        />
      </Wrapper>,
    )

    expect(screen.getByTestId("custom-fr")).toHaveTextContent("French (active)")
    expect(screen.getByTestId("custom-es-ES")).toHaveTextContent("Spanish")
  })
})

describe("useTranslateDOM", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockEngineStatus = "idle"
    mockDOMIsTranslating = false
    mockDOMCurrentLang = null
    mockDOMTranslate.mockResolvedValue(undefined)
    setupMockOn()
  })

  afterEach(cleanup)

  it("calls domTranslator.translate on translatePage", async () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <DOMHookInspector />
      </Wrapper>,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId("dom-translate"))
    })

    expect(mockDOMTranslate).toHaveBeenCalledWith("fr")
  })

  it("calls domTranslator.restore on restorePage", () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <DOMHookInspector />
      </Wrapper>,
    )

    fireEvent.click(screen.getByTestId("dom-restore"))
    expect(mockDOMRestore).toHaveBeenCalledTimes(1)
  })

  it("reports null progress when not translating", () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <DOMHookInspector />
      </Wrapper>,
    )

    expect(screen.getByTestId("dom-progress")).toHaveTextContent("null")
  })
})

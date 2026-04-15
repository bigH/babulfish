/// <reference types="@testing-library/jest-dom" />
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react"
import { Profiler } from "react"
import type { Snapshot } from "@babulfish/core"

// ---------------------------------------------------------------------------
// Mock — @babulfish/core
// ---------------------------------------------------------------------------

const MOCK_LANGUAGES = [
  { label: "Spanish", code: "es-ES" },
  { label: "French", code: "fr" },
  { label: "German", code: "de" },
  { label: "Japanese", code: "ja" },
  { label: "Korean", code: "ko" },
  { label: "Chinese (Simplified)", code: "zh-CN" },
  { label: "Hindi", code: "hi" },
  { label: "Portuguese (Brazil)", code: "pt-BR" },
  { label: "Arabic", code: "ar" },
  { label: "Russian", code: "ru" },
  { label: "Italian", code: "it" },
  { label: "Thai", code: "th" },
  { label: "Vietnamese", code: "vi" },
]

let mockSnapshot: Snapshot
const listeners = new Set<() => void>()

function createDefaultSnapshot(): Snapshot {
  return Object.freeze({
    model: Object.freeze({ status: "idle" as const }),
    translation: Object.freeze({ status: "idle" as const }),
    currentLanguage: null,
    capabilities: Object.freeze({
      ready: true,
      hasWebGPU: true,
      canTranslate: true,
      device: "webgpu" as const,
      isMobile: false,
    }),
  })
}

function setSnapshot(updater: (prev: Snapshot) => Snapshot) {
  mockSnapshot = Object.freeze(updater(mockSnapshot))
  for (const listener of listeners) listener()
}

const mockLoadModel = vi.fn<() => Promise<void>>()
const mockTranslateTo = vi.fn<(lang: string) => Promise<void>>()
const mockTranslateText = vi.fn<(text: string, lang: string) => Promise<string>>()
const mockRestore = vi.fn()
const mockAbort = vi.fn()
const mockDispose = vi.fn()
const mockCreateBabulfish = vi.fn(() => ({
  get snapshot() {
    return mockSnapshot
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  loadModel: (...args: unknown[]) => mockLoadModel(...(args as [])),
  translateTo: (lang: string) => mockTranslateTo(lang),
  translateText: (text: string, lang: string) => mockTranslateText(text, lang),
  restore: () => mockRestore(),
  abort: () => mockAbort(),
  dispose: () => mockDispose(),
  languages: MOCK_LANGUAGES,
}))

vi.mock("@babulfish/core", () => ({
  createBabulfish: (...args: unknown[]) => mockCreateBabulfish(...args),
  get DEFAULT_LANGUAGES() {
    return MOCK_LANGUAGES
  },
}))

// ---------------------------------------------------------------------------
// Imports (after mock)
// ---------------------------------------------------------------------------

import { TranslatorProvider } from "../provider.js"
import { useTranslator } from "../use-translator.js"
import { useTranslateDOM } from "../use-translate-dom.js"
import { TranslateButton } from "../translate-button.js"
import { TranslateDropdown } from "../translate-dropdown.js"
import type { TranslatorConfig } from "../provider.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DOM_CONFIG: TranslatorConfig = {
  dom: { roots: ["main"] },
}

function Wrapper({
  config,
  children,
}: {
  config?: TranslatorConfig
  children: React.ReactNode
}) {
  return <TranslatorProvider config={config}>{children}</TranslatorProvider>
}

function HookInspector() {
  const state = useTranslator()
  return (
    <div>
      <span data-testid="model-status">{state.model.status}</span>
      <span data-testid="translation-status">{state.translation.status}</span>
      <span data-testid="current-language">
        {state.currentLanguage ?? "none"}
      </span>
      <span data-testid="capabilities-ready">
        {String(state.capabilitiesReady)}
      </span>
      <span data-testid="is-supported">{String(state.isSupported)}</span>
      <span data-testid="has-webgpu">{String(state.hasWebGPU)}</span>
      <span data-testid="can-translate">{String(state.canTranslate)}</span>
      <span data-testid="device">{state.device ?? "none"}</span>
      <span data-testid="is-mobile">{String(state.isMobile)}</span>
      <span data-testid="language-count">{state.languages.length}</span>
      <button data-testid="load" onClick={() => state.loadModel()}>
        Load
      </button>
      <button
        data-testid="translate-to"
        onClick={() => state.translateTo("es-ES")}
      >
        Translate
      </button>
      <button data-testid="restore" onClick={() => state.restore()}>
        Restore
      </button>
    </div>
  )
}

function DOMHookInspector() {
  const { translatePage, restorePage, progress } = useTranslateDOM()
  return (
    <div>
      <span data-testid="dom-progress">
        {progress === null ? "null" : String(progress)}
      </span>
      <button
        data-testid="dom-translate"
        onClick={() => translatePage("fr")}
      >
        Translate
      </button>
      <button data-testid="dom-restore" onClick={() => restorePage()}>
        Restore
      </button>
    </div>
  )
}

function clickOutside() {
  fireEvent.mouseDown(document.body)
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

type SnapshotOverrides = {
  model?: Partial<Snapshot["model"]>
  translation?: Partial<Snapshot["translation"]>
  currentLanguage?: Snapshot["currentLanguage"]
  capabilities?: Partial<Snapshot["capabilities"]>
}

function setMockSnapshot(overrides: SnapshotOverrides = {}) {
  setSnapshot((prev) => {
    const hasCurrentLanguage = Object.prototype.hasOwnProperty.call(
      overrides,
      "currentLanguage",
    )

    return Object.freeze({
      ...prev,
      model: Object.freeze({
        ...prev.model,
        ...(overrides.model ?? {}),
      }),
      translation: Object.freeze({
        ...prev.translation,
        ...(overrides.translation ?? {}),
      }),
      currentLanguage: hasCurrentLanguage
        ? overrides.currentLanguage
        : prev.currentLanguage,
      capabilities: Object.freeze({
        ...prev.capabilities,
        ...(overrides.capabilities ?? {}),
      }),
    })
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  listeners.clear()
  mockSnapshot = createDefaultSnapshot()
  mockLoadModel.mockResolvedValue(undefined)
  mockTranslateTo.mockResolvedValue(undefined)
  mockTranslateText.mockResolvedValue("translated")
})

afterEach(cleanup)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("TranslatorProvider", () => {
  it("renders children", () => {
    render(
      <TranslatorProvider>
        <span data-testid="child">hello</span>
      </TranslatorProvider>,
    )
    expect(screen.getByTestId("child")).toHaveTextContent("hello")
  })

  it("throws when hook used outside provider", () => {
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
      String(MOCK_LANGUAGES.length),
    )
  })

  it("creates the core once per mounted provider", () => {
    const { rerender } = render(
      <TranslatorProvider>
        <span data-testid="child">hello</span>
      </TranslatorProvider>,
    )

    rerender(
      <TranslatorProvider>
        <span data-testid="child">updated</span>
      </TranslatorProvider>,
    )

    expect(mockCreateBabulfish).toHaveBeenCalledTimes(1)
  })

  it("does not recreate core when config changes after mount", () => {
    const initialConfig = { dom: { roots: ["main"] } }
    const updatedConfig = { dom: { roots: ["body"] } }
    const { rerender } = render(
      <TranslatorProvider config={initialConfig}>
        <span data-testid="child">hello</span>
      </TranslatorProvider>,
    )

    rerender(
      <TranslatorProvider config={updatedConfig}>
        <span data-testid="child">updated</span>
      </TranslatorProvider>,
    )

    expect(mockCreateBabulfish).toHaveBeenCalledTimes(1)
  })

  it("disposes the created core on unmount", () => {
    const { unmount } = render(
      <TranslatorProvider>
        <span data-testid="child">hello</span>
      </TranslatorProvider>,
    )

    unmount()

    expect(mockCreateBabulfish).toHaveBeenCalledTimes(1)
    expect(mockDispose).toHaveBeenCalledTimes(1)
  })
})

describe("useTranslator", () => {
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
    expect(screen.getByTestId("has-webgpu")).toHaveTextContent("true")
    expect(screen.getByTestId("can-translate")).toHaveTextContent("true")
    expect(screen.getByTestId("device")).toHaveTextContent("webgpu")
    expect(screen.getByTestId("is-mobile")).toHaveTextContent("false")
  })

  it("reports translation support with WASM fallback when WebGPU is unavailable", () => {
    setMockSnapshot({
      capabilities: {
        hasWebGPU: false,
        canTranslate: true,
        device: "wasm" as const,
      },
    })

    render(
      <Wrapper config={DOM_CONFIG}>
        <HookInspector />
      </Wrapper>,
    )

    expect(screen.getByTestId("is-supported")).toHaveTextContent("true")
    expect(screen.getByTestId("has-webgpu")).toHaveTextContent("false")
    expect(screen.getByTestId("can-translate")).toHaveTextContent("true")
    expect(screen.getByTestId("device")).toHaveTextContent("wasm")
  })

  it("reports isMobile=true on mobile device", () => {
    setMockSnapshot({
      capabilities: { isMobile: true },
    })

    render(
      <Wrapper config={DOM_CONFIG}>
        <HookInspector />
      </Wrapper>,
    )

    expect(screen.getByTestId("is-mobile")).toHaveTextContent("true")
  })

  it("reports unsupported when translation is unavailable", () => {
    setMockSnapshot({
      capabilities: { hasWebGPU: true, canTranslate: false, device: "webgpu" as const },
    })

    render(
      <Wrapper config={DOM_CONFIG}>
        <HookInspector />
      </Wrapper>,
    )

    expect(screen.getByTestId("is-supported")).toHaveTextContent("false")
    expect(screen.getByTestId("can-translate")).toHaveTextContent("false")
    expect(screen.getByTestId("has-webgpu")).toHaveTextContent("true")
  })

  it("calls core.loadModel on loadModel", async () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <HookInspector />
      </Wrapper>,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId("load"))
    })

    expect(mockLoadModel).toHaveBeenCalledTimes(1)
  })

  it("calls core.restore on restore", () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <HookInspector />
      </Wrapper>,
    )

    fireEvent.click(screen.getByTestId("restore"))
    expect(mockRestore).toHaveBeenCalledTimes(1)
  })
})

describe("TranslateButton", () => {
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

  it("dismisses ready dropdown on click outside", async () => {
    mockLoadModel.mockImplementation(async () => {
      setMockSnapshot({
        model: { status: "ready" as const },
      })
    })

    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    const button = screen.getByRole("button")

    fireEvent.click(button)
    await act(async () => {
      fireEvent.click(button)
    })

    fireEvent.click(button)
    expect(screen.getByRole("listbox")).toBeInTheDocument()

    clickOutside()
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
  })

  it("dismisses ready dropdown on Escape key", async () => {
    mockLoadModel.mockImplementation(async () => {
      setMockSnapshot({
        model: { status: "ready" as const },
      })
    })

    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    const button = screen.getByRole("button")

    fireEvent.click(button)
    await act(async () => {
      fireEvent.click(button)
    })

    fireEvent.click(button)
    expect(screen.getByRole("listbox")).toBeInTheDocument()

    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument()
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

    expect(mockLoadModel).toHaveBeenCalledTimes(1)
  })

  it("shows language dropdown when button clicked in ready state", async () => {
    mockLoadModel.mockImplementation(async () => {
      setMockSnapshot({
        model: { status: "ready" as const },
      })
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
    expect(screen.getByText("Original")).toBeInTheDocument()
    expect(screen.getByText("Spanish")).toBeInTheDocument()
    expect(screen.getByText("French")).toBeInTheDocument()
  })

  it("shows an explicit mobile warning state", () => {
    setMockSnapshot({
      capabilities: {
        hasWebGPU: false,
        canTranslate: true,
        device: "wasm" as const,
        isMobile: true,
      },
    })

    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    const button = screen.getByRole("button")

    fireEvent.click(button)

    expect(screen.getByText(/desktop-only for now/i)).toBeInTheDocument()
    expect(button).toBeDisabled()
  })

  it("renders and explains the WASM fallback on desktop", async () => {
    setMockSnapshot({
      capabilities: {
        hasWebGPU: false,
        canTranslate: true,
        device: "wasm" as const,
      },
    })

    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    const button = screen.getByRole("button")

    fireEvent.mouseEnter(button)
    expect(screen.getByText(/slower WASM fallback/i)).toBeInTheDocument()

    fireEvent.click(button)
    expect(screen.getByText(/Click again to confirm/i)).toBeInTheDocument()

    await act(async () => {
      fireEvent.click(button)
    })

    expect(mockLoadModel).toHaveBeenCalledTimes(1)
  })

  it("does not render when canTranslate is false", () => {
    setMockSnapshot({
      capabilities: {
        hasWebGPU: false,
        canTranslate: false,
        device: "webgpu" as const,
      },
    })

    const { container } = render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    expect(container.querySelector("button")).toBeNull()
  })

  it("shows non-zero translation progress from hook state", async () => {
    mockLoadModel.mockImplementation(async () => {
      setMockSnapshot({
        model: { status: "ready" as const },
      })
    })

    const deferred = createDeferred<void>()
    mockTranslateTo.mockImplementation(async (lang) => {
      setMockSnapshot({
        translation: { status: "translating", progress: 0.5 },
        currentLanguage: lang,
      })
      await deferred.promise
      setMockSnapshot({
        translation: { status: "idle" as const },
      })
    })

    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    const button = screen.getByRole("button")

    // Get to ready state
    fireEvent.click(button)
    await act(async () => {
      fireEvent.click(button)
    })

    // Open dropdown and select Spanish
    fireEvent.click(button)
    await act(async () => {
      fireEvent.click(screen.getByText("Spanish"))
      await Promise.resolve()
    })

    expect(button).toHaveTextContent("50%")

    await act(async () => {
      deferred.resolve()
      await Promise.resolve()
    })

    expect(button).not.toHaveTextContent("50%")
  })

  it("shows non-zero download progress from hook state", async () => {
    const deferred = createDeferred<void>()
    mockLoadModel.mockImplementation(async () => {
      setMockSnapshot({
        model: { status: "downloading", progress: 0.25 },
      })
      await deferred.promise
      setMockSnapshot({
        model: { status: "ready" as const },
      })
    })

    render(
      <Wrapper config={DOM_CONFIG}>
        <TranslateButton />
      </Wrapper>,
    )

    const button = screen.getByRole("button")

    // Get to confirm state
    fireEvent.click(button)
    await act(async () => {
      fireEvent.click(button)
      await Promise.resolve()
    })

    expect(button).toHaveTextContent("25%")

    await act(async () => {
      deferred.resolve()
      await Promise.resolve()
    })

    expect(button).not.toHaveTextContent("25%")
  })

  it("does not mirror download progress through an extra local render", async () => {
    let commitCount = 0

    render(
      <Wrapper config={DOM_CONFIG}>
        <Profiler id="translate-button" onRender={() => { commitCount += 1 }}>
          <TranslateButton />
        </Profiler>
      </Wrapper>,
    )

    await act(async () => {
      setMockSnapshot({
        model: { status: "downloading", progress: 0.1 },
      })
      await Promise.resolve()
    })

    const button = screen.getByRole("button")
    expect(button).toHaveTextContent("10%")

    commitCount = 0

    await act(async () => {
      setMockSnapshot({
        model: { status: "downloading", progress: 0.2 },
      })
      await Promise.resolve()
    })

    expect(button).toHaveTextContent("20%")
    expect(commitCount).toBe(1)
  })

  it("handles a burst of download progress snapshots without a depth warning", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    try {
      render(
        <Wrapper config={DOM_CONFIG}>
          <TranslateButton />
        </Wrapper>,
      )

      await act(async () => {
        for (let step = 1; step <= 80; step += 1) {
          setMockSnapshot({
            model: { status: "downloading", progress: step / 80 },
          })
        }
        await Promise.resolve()
      })

      expect(screen.getByRole("button")).toHaveTextContent("100%")

      const loggedMaximumDepth = errorSpy.mock.calls.some((call) =>
        call.some((arg) =>
          String(arg).includes("Maximum update depth exceeded"),
        ),
      )

      expect(loggedMaximumDepth).toBe(false)
    } finally {
      errorSpy.mockRestore()
    }
  })
})

describe("TranslateDropdown", () => {
  const testLanguages = [
    { label: "Spanish", code: "es-ES" },
    { label: "French", code: "fr" },
  ]

  function renderDropdown(
    props: Partial<React.ComponentProps<typeof TranslateDropdown>> = {},
  ) {
    return render(
      <TranslateDropdown
        onSelect={() => {}}
        languages={testLanguages}
        {...props}
      />,
    )
  }

  it("renders all languages from props without a provider", () => {
    renderDropdown()

    expect(screen.getByText("Spanish")).toBeInTheDocument()
    expect(screen.getByText("French")).toBeInTheDocument()
  })

  it("throws when neither languages nor a provider are present", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => render(<TranslateDropdown onSelect={() => {}} />)).toThrow(
      "TranslateDropdown requires either a languages prop or a <TranslatorProvider>",
    )

    spy.mockRestore()
  })

  it("calls onSelect with correct code", () => {
    const onSelect = vi.fn()
    renderDropdown({ onSelect })

    fireEvent.click(screen.getByText("Spanish"))
    expect(onSelect).toHaveBeenCalledWith("es-ES")
  })

  it("marks active language", () => {
    renderDropdown({ value: "es-ES" })

    const options = screen.getAllByRole("option")
    const spanish = options.find((el) => el.textContent?.includes("Spanish"))
    expect(spanish).toHaveAttribute("aria-selected", "true")
  })

  it("applies disabled styling", () => {
    renderDropdown({ disabled: true })

    const listbox = screen.getByRole("listbox")
    expect(listbox.style.pointerEvents).toBe("none")
    expect(listbox.style.opacity).toBe("0.5")
  })

  it("does not call onSelect when disabled", () => {
    const onSelect = vi.fn()
    renderDropdown({ disabled: true, onSelect })

    fireEvent.click(screen.getByText("Spanish"))
    expect(onSelect).not.toHaveBeenCalled()
  })

  it("does not call onRestore when disabled", () => {
    const onRestore = vi.fn()
    renderDropdown({ disabled: true, onRestore })

    fireEvent.click(screen.getByText("Original"))
    expect(onRestore).not.toHaveBeenCalled()
  })

  it("uses custom renderOption", () => {
    renderDropdown({
      renderOption: (lang, active) => (
        <span data-testid={`custom-${lang.code}`}>
          {lang.label} {active ? "(active)" : ""}
        </span>
      ),
      value: "fr",
    })

    expect(screen.getByTestId("custom-fr")).toHaveTextContent("French (active)")
    expect(screen.getByTestId("custom-es-ES")).toHaveTextContent("Spanish")
  })

  it("shows Original entry above languages when onRestore is provided", () => {
    renderDropdown({ onRestore: () => {} })

    const options = screen.getAllByRole("option")
    expect(options[0]).toHaveTextContent("Original")
    expect(options[1]).toHaveTextContent("Spanish")
    expect(options[2]).toHaveTextContent("French")
  })

  it("calls onRestore when Original is clicked", () => {
    const onRestore = vi.fn()
    renderDropdown({ onRestore })

    fireEvent.click(screen.getByText("Original"))
    expect(onRestore).toHaveBeenCalledTimes(1)
  })

  it("marks Original as active when value is null", () => {
    renderDropdown({ onRestore: () => {}, value: null })

    const options = screen.getAllByRole("option")
    expect(options[0]).toHaveAttribute("aria-selected", "true")
    expect(options[1]).toHaveAttribute("aria-selected", "false")
  })

  it("does not show Original when onRestore is omitted", () => {
    renderDropdown()

    expect(screen.queryByText("Original")).not.toBeInTheDocument()
    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(2)
  })

  it("does not alter consumer languages list when showing Original", () => {
    const onSelect = vi.fn()
    renderDropdown({ onSelect, onRestore: () => {} })

    fireEvent.click(screen.getByText("Spanish"))
    expect(onSelect).toHaveBeenCalledWith("es-ES")

    const options = screen.getAllByRole("option")
    expect(options).toHaveLength(3)
  })

  it("falls back to provider languages when no languages prop is supplied", () => {
    render(
      <Wrapper>
        <TranslateDropdown onSelect={() => {}} />
      </Wrapper>,
    )

    expect(screen.getByText("Spanish")).toBeInTheDocument()
    expect(screen.getByText("French")).toBeInTheDocument()
    expect(screen.getByText("German")).toBeInTheDocument()
  })

  it("prefers explicit languages over provider languages", () => {
    render(
      <Wrapper>
        <TranslateDropdown onSelect={() => {}} languages={testLanguages} />
      </Wrapper>,
    )

    expect(screen.getByText("Spanish")).toBeInTheDocument()
    expect(screen.getByText("French")).toBeInTheDocument()
    expect(screen.queryByText("German")).not.toBeInTheDocument()
  })
})

describe("useTranslateDOM", () => {
  it("calls core.translateTo on translatePage", async () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <DOMHookInspector />
      </Wrapper>,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId("dom-translate"))
    })

    expect(mockTranslateTo).toHaveBeenCalledWith("fr")
  })

  it("calls core.restore on restorePage", () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <DOMHookInspector />
      </Wrapper>,
    )

    fireEvent.click(screen.getByTestId("dom-restore"))
    expect(mockRestore).toHaveBeenCalledTimes(1)
  })

  it("reports null progress when not translating", () => {
    render(
      <Wrapper config={DOM_CONFIG}>
        <DOMHookInspector />
      </Wrapper>,
    )

    expect(screen.getByTestId("dom-progress")).toHaveTextContent("null")
  })

  it("reports translation progress from snapshot", async () => {
    const deferred = createDeferred<void>()
    mockTranslateTo.mockImplementation(async () => {
      setMockSnapshot({
        translation: { status: "translating", progress: 0.5 },
      })
      await deferred.promise
      setMockSnapshot({
        translation: { status: "idle" as const },
      })
    })

    render(
      <Wrapper config={DOM_CONFIG}>
        <DOMHookInspector />
      </Wrapper>,
    )

    await act(async () => {
      fireEvent.click(screen.getByTestId("dom-translate"))
      await Promise.resolve()
    })

    expect(screen.getByTestId("dom-progress")).toHaveTextContent("0.5")

    await act(async () => {
      deferred.resolve()
      await Promise.resolve()
    })

    expect(screen.getByTestId("dom-progress")).toHaveTextContent("null")
  })
})

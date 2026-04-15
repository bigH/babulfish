// TranslateButton — pre-built translation UI component
// 5-state machine: idle -> confirm -> downloading -> ready -> translating
// No Tailwind, no external icons. Positioning is the consumer's job.

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from "react"
import { useTranslator } from "./use-translator.js"
import { TranslateDropdown } from "./translate-dropdown.js"
import type { ResolvedDevice } from "@babulfish/core/engine"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TranslateButtonClassNames = {
  readonly button?: string
  readonly tooltip?: string
  readonly dropdown?: string
  readonly dropdownItem?: string
  readonly progressRing?: string
}

type ProgressRingColors = {
  readonly downloadColor?: string
  readonly translateColor?: string
}

type TooltipRenderProps = {
  readonly mobile: boolean
  readonly confirming: boolean
  readonly hasWebGPU: boolean
  readonly canTranslate: boolean
  readonly device: ResolvedDevice | null
  readonly defaultUIEnabled: boolean
}

type ButtonState =
  | { readonly kind: "idle" }
  | { readonly kind: "confirm" }
  | { readonly kind: "downloading"; readonly progress: number }
  | { readonly kind: "ready"; readonly dropdownOpen: boolean }
  | { readonly kind: "translating"; readonly dropdownOpen: boolean; readonly progress: number }

function dismissTransientState(state: ButtonState): ButtonState {
  if (state.kind === "confirm") return { kind: "idle" }
  if (state.kind === "ready" && state.dropdownOpen) {
    return { kind: "ready", dropdownOpen: false }
  }
  return state
}

export type TranslateButtonProps = {
  readonly classNames?: TranslateButtonClassNames
  readonly icon?: ReactNode
  readonly renderTooltip?: (props: TooltipRenderProps) => ReactNode
  readonly progressRing?: ProgressRingColors
}

// ---------------------------------------------------------------------------
// Built-in globe SVG (no lucide dependency)
// ---------------------------------------------------------------------------

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
      <path d="M2 12h20" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// ProgressRing
// ---------------------------------------------------------------------------

const RING_RADIUS = 23
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

function ProgressRing({
  progress,
  color = "var(--babulfish-accent, #3b82f6)",
  className,
}: {
  progress: number
  color?: string
  className?: string
}) {
  const offset = (1 - Math.min(Math.max(progress, 0), 1)) * RING_CIRCUMFERENCE

  return (
    <svg
      className={className}
      viewBox="0 0 54 54"
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: "-8px",
        transform: "rotate(-90deg)",
        pointerEvents: "none",
      }}
    >
      <circle
        cx="27"
        cy="27"
        r={RING_RADIUS}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeDasharray={RING_CIRCUMFERENCE}
        strokeDashoffset={offset}
        strokeLinecap="round"
        style={{ transition: "stroke-dashoffset 300ms ease-out" }}
      />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Default tooltip
// ---------------------------------------------------------------------------

function DefaultTooltip({
  mobile,
  confirming,
  hasWebGPU,
  canTranslate,
  device,
  defaultUIEnabled,
  fading,
  onFadeComplete,
  className,
}: {
  mobile: boolean
  confirming: boolean
  hasWebGPU: boolean
  canTranslate: boolean
  device: ResolvedDevice | null
  defaultUIEnabled: boolean
  fading: boolean
  onFadeComplete?: () => void
  className?: string
}) {
  const baseStyle: React.CSSProperties = {
    whiteSpace: "normal",
    maxWidth: "18rem",
    padding: "0.5rem 0.75rem",
    borderRadius: "0.5rem",
    background: "var(--babulfish-surface, #fff)",
    border: "1px solid var(--babulfish-border, #e5e7eb)",
    boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
    fontSize: "0.875rem",
    ...(fading ? { opacity: 0, transition: "opacity 2s ease-out" } : {}),
  }

  return (
    <div
      id="babulfish-tooltip"
      className={"babulfish-popup" + (className ? ` ${className}` : "")}
      style={baseStyle}
      onTransitionEnd={fading ? onFadeComplete : undefined}
      role="tooltip"
    >
      {!canTranslate ? (
        "Translation is unavailable in this browser."
      ) : !defaultUIEnabled && mobile ? (
        "The default TranslateButton stays desktop-only for now. Mobile translation is not validated as a default product path yet."
      ) : confirming ? (
        <p style={{ margin: 0 }}>
          Heads up: <strong>~2.9 GB download.</strong>{" "}
          {device === "wasm" && !hasWebGPU
            ? "This browser will use the slower WASM fallback. "
            : ""}
          Click again to confirm.
        </p>
      ) : device === "wasm" && !hasWebGPU ? (
        <p style={{ margin: 0 }}>
          WebGPU is unavailable here, so translation will run through the
          slower WASM fallback. <strong>Still client-side.</strong>
        </p>
      ) : (
        <p style={{ margin: 0 }}>
          Client-side AI translation — runs on your GPU,{" "}
          <strong>never phones home.</strong>
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// TranslateButton
// ---------------------------------------------------------------------------

export function TranslateButton({
  classNames,
  icon,
  renderTooltip,
  progressRing,
}: TranslateButtonProps = {}) {
  const {
    model,
    translation,
    capabilitiesReady,
    hasWebGPU,
    canTranslate,
    device,
    isMobile,
    languages,
    loadModel,
    translateTo,
    restore,
    currentLanguage,
  } = useTranslator()

  const [state, setState] = useState<ButtonState>({ kind: "idle" })
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [initialPeek, setInitialPeek] = useState(false)
  const [peekFading, setPeekFading] = useState(false)
  const peekDismissed = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Sync engine status -> button state
  const modelProgress = model.status === "downloading" ? model.progress : 0
  useEffect(() => {
    if (model.status === "downloading") {
      setState({ kind: "downloading", progress: modelProgress })
    } else if (model.status === "ready" && state.kind === "downloading") {
      setState({ kind: "ready", dropdownOpen: false })
    } else if (model.status === "error") {
      setState({ kind: "idle" })
    }
  }, [model.status, modelProgress, state.kind])

  const translationProgress =
    translation.status === "translating" ? translation.progress : null
  useEffect(() => {
    if (translationProgress === null) {
      setState((prev) =>
        prev.kind === "translating"
          ? { kind: "ready", dropdownOpen: false }
          : prev,
      )
      return
    }

    setState((prev) => {
      const dropdownOpen =
        prev.kind === "ready" || prev.kind === "translating"
          ? prev.dropdownOpen
          : false

      if (
        prev.kind === "translating" &&
        prev.progress === translationProgress &&
        prev.dropdownOpen === dropdownOpen
      ) {
        return prev
      }

      return {
        kind: "translating",
        dropdownOpen,
        progress: translationProgress,
      }
    })
  }, [translationProgress])

  // Auto-show tooltip peek
  useEffect(() => {
    const showTimer = setTimeout(() => {
      if (!peekDismissed.current) setInitialPeek(true)
    }, 2_000)
    const fadeTimer = setTimeout(() => setPeekFading(true), 5_000)
    const cleanupTimer = setTimeout(() => {
      setInitialPeek(false)
      setPeekFading(false)
    }, 7_000)
    return () => {
      clearTimeout(showTimer)
      clearTimeout(fadeTimer)
      clearTimeout(cleanupTimer)
    }
  }, [])

  // Dismiss peek when state leaves idle
  useEffect(() => {
    if (state.kind !== "idle") {
      peekDismissed.current = true
      setInitialPeek(false)
      setPeekFading(false)
    }
  }, [state.kind])

  // Click-away dismiss
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        setState(dismissTransientState)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Escape key dismiss
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      setState(dismissTransientState)
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [])

  // Keyboard nav for dropdown — no useCallback; deps include
  // handleLanguageSelect which is a plain function, and this handler
  // only fires on key events so re-creation cost is negligible.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (state.kind !== "ready" || !state.dropdownOpen) return

    const totalItems = languages.length + 1
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setFocusedIndex((prev) => Math.min(prev + 1, totalItems - 1))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setFocusedIndex((prev) => Math.max(prev - 1, 0))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (focusedIndex === 0) {
        handleRestore()
      } else {
        const lang = languages[focusedIndex - 1]
        if (lang) handleLanguageSelect(lang.code)
      }
    }
  }

  const handlePeekFadeComplete = useCallback(() => {
    setInitialPeek(false)
    setPeekFading(false)
  }, [])

  // Button click handler
  function handleButtonClick() {
    switch (state.kind) {
      case "idle":
        setState({ kind: "confirm" })
        break
      case "confirm":
        if (isMobile || !canTranslate) return
        startDownload()
        break
      case "ready":
        setFocusedIndex(0)
        setState((prev) =>
          prev.kind === "ready"
            ? { kind: "ready", dropdownOpen: !prev.dropdownOpen }
            : prev,
        )
        break
      default:
        break
    }
  }

  async function startDownload() {
    setState({ kind: "downloading", progress: 0 })
    try {
      await loadModel()
    } catch {
      setState({ kind: "idle" })
    }
  }

  function handleRestore() {
    restore()
    setState({ kind: "ready", dropdownOpen: false })
  }

  async function handleLanguageSelect(code: string) {
    if (state.kind !== "ready") return

    setState({ kind: "translating", dropdownOpen: true, progress: 0 })
    try {
      await translateTo(code)
    } catch {
      restore()
    }
    setState({ kind: "ready", dropdownOpen: false })
  }

  // Keep SSR and first client render on the same neutral markup.
  if (!capabilitiesReady) return null

  if (!canTranslate) return null

  const defaultUIEnabled = !isMobile
  const confirmDisabled = state.kind === "confirm" && !defaultUIEnabled

  const isInteractive =
    state.kind !== "downloading" &&
    state.kind !== "translating" &&
    !confirmDisabled

  const showTooltip =
    state.kind === "confirm" ||
    (state.kind === "idle" && (hovered || initialPeek))

  const tooltipFading = peekFading && !hovered && state.kind !== "confirm"

  const downloadColor =
    progressRing?.downloadColor ?? "var(--babulfish-accent, #3b82f6)"
  const translateColor =
    progressRing?.translateColor ?? "rgb(248 113 113)"

  const isDownloading = state.kind === "downloading"
  const isTranslating = state.kind === "translating"
  const isProgressState = isDownloading || isTranslating
  const progressText = isProgressState
    ? `${Math.round(state.progress * 100)}%`
    : null
  const activeProgressRingColor = isDownloading ? downloadColor : translateColor

  const ariaLabel =
    isDownloading
      ? `Downloading translation model: ${progressText}`
      : isTranslating
        ? "Translating page"
        : state.kind === "confirm" && !defaultUIEnabled
          ? "Translation is currently desktop-only"
        : state.kind === "ready"
          ? "Translation model ready"
          : "Translate page"

  const liveText =
    isDownloading
      ? `Downloading translation model: ${progressText}`
      : isProgressState
        ? "Translating page"
        : state.kind === "ready"
          ? "Translation model ready"
          : ""

  const buttonAnimClass =
    state.kind === "idle" && initialPeek && !tooltipFading
      ? "babulfish-globe-peek"
      : state.kind === "idle" && tooltipFading
        ? "babulfish-globe-peek-out"
        : state.kind === "translating"
          ? "babulfish-active"
          : state.kind === "ready"
            ? "babulfish-globe-ready"
            : ""

  const iconElement = icon ?? (
    <GlobeIcon
      className={
        state.kind === "ready"
          ? "babulfish-icon-ready"
          : initialPeek && !tooltipFading
            ? "babulfish-icon-peek"
            : "babulfish-icon-muted"
      }
    />
  )

  return (
    <div
      ref={containerRef}
      onKeyDown={handleKeyDown}
      style={{ position: "relative" }}
    >
        {/* Live region for screen readers */}
        <span
          style={{
            position: "absolute",
            width: "1px",
            height: "1px",
            padding: 0,
            margin: "-1px",
            overflow: "hidden",
            clip: "rect(0, 0, 0, 0)",
            whiteSpace: "nowrap",
            borderWidth: 0,
          }}
          aria-live="polite"
        >
          {liveText}
        </span>

        <button
          type="button"
          aria-label={ariaLabel}
          aria-describedby={showTooltip ? "babulfish-tooltip" : undefined}
          tabIndex={0}
          onClick={handleButtonClick}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          disabled={!isInteractive}
          className={
            buttonAnimClass +
            (classNames?.button ? ` ${classNames.button}` : "")
          }
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "2.5rem",
            height: "2.5rem",
            borderRadius: "9999px",
            border: "1px solid var(--babulfish-border, #e5e7eb)",
            background: "var(--babulfish-surface, #fff)",
            cursor: isInteractive ? "pointer" : "default",
          }}
        >
          {isProgressState ? (
            <span
              style={{
                fontSize: "10px",
                fontWeight: 500,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {progressText}
            </span>
          ) : (
            iconElement
          )}

          {isProgressState && (
            <ProgressRing
              progress={state.progress}
              color={activeProgressRingColor}
              className={classNames?.progressRing}
            />
          )}
        </button>

        {/* Tooltip */}
        {showTooltip && (
          renderTooltip
            ? renderTooltip({
                mobile: isMobile,
                confirming: state.kind === "confirm",
                hasWebGPU,
                canTranslate,
                device,
                defaultUIEnabled,
              })
            : (
              <DefaultTooltip
                mobile={isMobile}
                confirming={state.kind === "confirm"}
                hasWebGPU={hasWebGPU}
                canTranslate={canTranslate}
                device={device}
                defaultUIEnabled={defaultUIEnabled}
                fading={tooltipFading}
                onFadeComplete={handlePeekFadeComplete}
                className={classNames?.tooltip}
              />
            )
        )}

        {/* Language dropdown */}
        {state.kind === "ready" && state.dropdownOpen && (
          <TranslateDropdown
            value={currentLanguage}
            disabled={false}
            onSelect={handleLanguageSelect}
            onRestore={handleRestore}
            focusedIndex={focusedIndex}
            className={classNames?.dropdown}
          />
        )}
        {state.kind === "translating" && state.dropdownOpen && (
          <TranslateDropdown
            value={currentLanguage}
            disabled
            onSelect={() => {}}
            onRestore={() => {}}
            focusedIndex={-1}
            className={classNames?.dropdown}
          />
        )}
    </div>
  )
}

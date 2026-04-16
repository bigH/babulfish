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
import type { Snapshot } from "@babulfish/core"
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

type ButtonPhase =
  | "idle"
  | "confirm"
  | "downloading"
  | "ready"
  | "translating"

type PendingAction = "download" | "translate" | null

function getButtonPhase({
  confirming,
  modelStatus,
  translationStatus,
  pendingAction,
}: {
  confirming: boolean
  modelStatus: Snapshot["model"]["status"]
  translationStatus: Snapshot["translation"]["status"]
  pendingAction: PendingAction
}): ButtonPhase {
  if (translationStatus === "translating" || pendingAction === "translate") {
    return "translating"
  }

  if (modelStatus === "downloading" || pendingAction === "download") {
    return "downloading"
  }

  if (modelStatus === "ready") {
    return "ready"
  }

  return confirming ? "confirm" : "idle"
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
    width: "max-content",
    maxWidth: "min(18rem, calc(100vw - 1rem))",
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

  const [confirming, setConfirming] = useState(false)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const [pendingAction, setPendingAction] = useState<PendingAction>(null)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [hovered, setHovered] = useState(false)
  const [initialPeek, setInitialPeek] = useState(false)
  const [peekFading, setPeekFading] = useState(false)
  const peekDismissed = useRef(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const previousTranslationStatus = useRef(translation.status)

  const modelProgress = model.status === "downloading" ? model.progress : 0
  const translationProgress =
    translation.status === "translating" ? translation.progress : null
  const phase = getButtonPhase({
    confirming,
    modelStatus: model.status,
    translationStatus: translation.status,
    pendingAction,
  })

  useEffect(() => {
    if (
      model.status === "downloading" ||
      model.status === "ready" ||
      model.status === "error" ||
      translation.status === "translating"
    ) {
      setConfirming(false)
    }
  }, [model.status, translation.status])

  useEffect(() => {
    if (model.status === "downloading" || model.status === "error") {
      setDropdownOpen(false)
    }
  }, [model.status])

  useEffect(() => {
    if (
      previousTranslationStatus.current === "translating" &&
      translation.status !== "translating"
    ) {
      setDropdownOpen(false)
    }

    previousTranslationStatus.current = translation.status
  }, [translation.status])

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
    if (phase !== "idle") {
      peekDismissed.current = true
      setInitialPeek(false)
      setPeekFading(false)
    }
  }, [phase])

  const dismissTransientUi = useCallback(() => {
    if (phase === "confirm") {
      setConfirming(false)
    }

    if (phase === "ready" && dropdownOpen) {
      setDropdownOpen(false)
    }
  }, [dropdownOpen, phase])

  // Click-away dismiss
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) {
        dismissTransientUi()
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [dismissTransientUi])

  // Escape key dismiss
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key !== "Escape") return
      dismissTransientUi()
    }
    document.addEventListener("keydown", handleEscape)
    return () => document.removeEventListener("keydown", handleEscape)
  }, [dismissTransientUi])

  // Keyboard nav for dropdown — no useCallback; deps include
  // handleLanguageSelect which is a plain function, and this handler
  // only fires on key events so re-creation cost is negligible.
  function handleKeyDown(e: React.KeyboardEvent) {
    if (phase !== "ready" || !dropdownOpen) return

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
    switch (phase) {
      case "idle":
        setConfirming(true)
        break
      case "confirm":
        if (isMobile || !canTranslate) return
        void startDownload()
        break
      case "ready":
        setFocusedIndex(0)
        setDropdownOpen((open) => !open)
        break
      default:
        break
    }
  }

  async function startDownload() {
    setConfirming(false)
    setDropdownOpen(false)
    setPendingAction("download")
    try {
      await loadModel()
    } catch {
      setConfirming(false)
      setDropdownOpen(false)
    } finally {
      setPendingAction((current) =>
        current === "download" ? null : current,
      )
    }
  }

  function handleRestore() {
    restore()
    setConfirming(false)
    setDropdownOpen(false)
  }

  async function handleLanguageSelect(code: string) {
    if (phase !== "ready") return

    setConfirming(false)
    setDropdownOpen(true)
    setPendingAction("translate")
    try {
      await translateTo(code)
    } catch {
      restore()
    } finally {
      setPendingAction((current) =>
        current === "translate" ? null : current,
      )
      setDropdownOpen(false)
    }
  }

  // Keep SSR and first client render on the same neutral markup.
  if (!capabilitiesReady) return null

  if (!canTranslate) return null

  const defaultUIEnabled = !isMobile
  const confirmDisabled = phase === "confirm" && !defaultUIEnabled

  const isDownloading = phase === "downloading"
  const isTranslating = phase === "translating"
  const isReady = phase === "ready"
  const isInteractive = !isDownloading && !isTranslating && !confirmDisabled

  const showTooltip =
    phase === "confirm" || (phase === "idle" && (hovered || initialPeek))

  const tooltipFading = peekFading && !hovered && phase !== "confirm"

  const downloadColor =
    progressRing?.downloadColor ?? "var(--babulfish-accent, #3b82f6)"
  const translateColor =
    progressRing?.translateColor ?? "rgb(248 113 113)"

  const isProgressState = isDownloading || isTranslating
  const progressValue = isDownloading
    ? modelProgress
    : translationProgress ?? 0
  const progressText = isProgressState
    ? `${Math.round(progressValue * 100)}%`
    : null
  const activeProgressRingColor = isDownloading ? downloadColor : translateColor

  const ariaLabel =
    isDownloading
      ? `Downloading translation model: ${progressText}`
      : isTranslating
        ? "Translating page"
        : phase === "confirm" && !defaultUIEnabled
          ? "Translation is currently desktop-only"
        : isReady
          ? "Translation model ready"
          : "Translate page"

  const liveText =
    isDownloading
      ? `Downloading translation model: ${progressText}`
      : isProgressState
        ? "Translating page"
        : isReady
          ? "Translation model ready"
          : ""

  const buttonAnimClass =
    phase === "idle" && initialPeek && !tooltipFading
      ? "babulfish-globe-peek"
      : phase === "idle" && tooltipFading
        ? "babulfish-globe-peek-out"
        : isTranslating
          ? "babulfish-active"
          : isReady
            ? "babulfish-globe-ready"
            : ""

  const iconElement = icon ?? (
    <GlobeIcon
      className={
        isReady
          ? "babulfish-icon-ready"
          : initialPeek && !tooltipFading
            ? "babulfish-icon-peek"
            : "babulfish-icon-muted"
      }
    />
  )
  const dropdownFocusedIndex = isTranslating ? -1 : focusedIndex
  const showDropdown = dropdownOpen && (isReady || isTranslating)

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
            progress={progressValue}
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
              confirming: phase === "confirm",
              hasWebGPU,
              canTranslate,
              device,
              defaultUIEnabled,
            })
          : (
            <DefaultTooltip
              mobile={isMobile}
              confirming={phase === "confirm"}
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

      {showDropdown && (
        <TranslateDropdown
          value={currentLanguage}
          disabled={isTranslating}
          onSelect={handleLanguageSelect}
          onRestore={handleRestore}
          focusedIndex={dropdownFocusedIndex}
          className={classNames?.dropdown}
          itemClassName={classNames?.dropdownItem}
        />
      )}
    </div>
  )
}

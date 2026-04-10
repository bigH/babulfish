// TranslateDropdown — standalone language picker, usable independently

import { useContext, useEffect, useRef, type ReactNode } from "react"
import { BabulfishContext } from "./context.js"
import type { BabulfishLanguage } from "./context.js"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TranslateDropdownProps = {
  readonly onSelect: (code: string) => void
  readonly value?: string | null
  readonly disabled?: boolean
  readonly className?: string
  readonly renderOption?: (lang: BabulfishLanguage, active: boolean) => ReactNode
  readonly languages?: BabulfishLanguage[]
  readonly focusedIndex?: number
}

// ---------------------------------------------------------------------------
// Built-in check icon
// ---------------------------------------------------------------------------

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TranslateDropdown({
  onSelect,
  value = null,
  disabled = false,
  className,
  renderOption,
  languages: languagesProp,
  focusedIndex = -1,
}: TranslateDropdownProps) {
  // Always call useContext unconditionally (hook rules).
  // When languages prop is supplied, the context value is simply ignored.
  const ctx = useContext(BabulfishContext)
  const languages = languagesProp ?? ctx?.languages

  if (!languages) {
    throw new Error(
      "TranslateDropdown requires either a languages prop or a <BabulfishProvider>",
    )
  }

  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    if (focusedIndex < 0) return
    const focused = listRef.current?.children[focusedIndex] as
      | HTMLElement
      | undefined
    focused?.scrollIntoView?.({ block: "nearest" })
  }, [focusedIndex])

  const focusedId =
    focusedIndex >= 0 ? `babulfish-lang-${focusedIndex}` : undefined

  return (
    <ul
      ref={listRef}
      role="listbox"
      aria-activedescendant={focusedId}
      className={
        "babulfish-popup" +
        (disabled ? " babulfish-dropdown-disabled" : "") +
        (className ? ` ${className}` : "")
      }
      style={disabled ? { pointerEvents: "none", opacity: 0.5 } : undefined}
    >
      {languages.map((lang, i) => {
        const isActive = lang.code === value
        const isFocused = i === focusedIndex

        if (renderOption) {
          return (
            <li
              key={lang.code}
              id={`babulfish-lang-${i}`}
              role="option"
              aria-selected={isActive}
              tabIndex={-1}
              onClick={() => onSelect(lang.code)}
            >
              {renderOption(lang, isActive)}
            </li>
          )
        }

        return (
          <li
            key={lang.code}
            id={`babulfish-lang-${i}`}
            role="option"
            aria-selected={isActive}
            tabIndex={-1}
            data-focused={isFocused || undefined}
            data-active={isActive || undefined}
            onClick={() => onSelect(lang.code)}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.5rem 0.75rem",
              cursor: "pointer",
              fontSize: "0.875rem",
              fontWeight: isActive ? 500 : 400,
            }}
          >
            {lang.label}
            {isActive && <CheckIcon />}
          </li>
        )
      })}
    </ul>
  )
}

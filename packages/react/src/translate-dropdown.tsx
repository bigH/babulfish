import type { Language } from "@babulfish/core"
import { useContext, useEffect, useRef, type ReactNode } from "react"
import { TranslatorContext } from "./context.js"

export type TranslateDropdownProps = {
  readonly onSelect: (code: string) => void
  readonly onRestore?: () => void
  readonly value?: string | null
  readonly disabled?: boolean
  readonly className?: string
  readonly renderOption?: (lang: Language, active: boolean) => ReactNode
  readonly languages?: readonly Language[]
  readonly focusedIndex?: number
}

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

export function TranslateDropdown({
  onSelect,
  onRestore,
  value = null,
  disabled = false,
  className,
  renderOption,
  languages: languagesProp,
  focusedIndex = -1,
}: TranslateDropdownProps) {
  const ctx = useContext(TranslatorContext)
  const languages = languagesProp ?? ctx?.languages

  if (!languages) {
    throw new Error(
      "TranslateDropdown requires either a languages prop or a <TranslatorProvider>",
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

  const hasOriginal = !!onRestore
  const isOriginalActive = value === null
  const handleSelect = (code: string) => {
    if (disabled) return
    onSelect(code)
  }
  const handleRestore = () => {
    if (disabled) return
    onRestore?.()
  }

  const itemStyle = (isActive: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: isActive ? 500 : 400,
  })

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
      {hasOriginal && (
        <li
          key="__original__"
          id="babulfish-lang-0"
          role="option"
          aria-selected={isOriginalActive}
          tabIndex={-1}
          data-focused={focusedIndex === 0 || undefined}
          data-active={isOriginalActive || undefined}
          onClick={handleRestore}
          style={itemStyle(isOriginalActive)}
        >
          Original
          {isOriginalActive && <CheckIcon />}
        </li>
      )}
      {languages.map((lang, i) => {
        const listIndex = hasOriginal ? i + 1 : i
        const isActive = lang.code === value
        const isFocused = listIndex === focusedIndex

        if (renderOption) {
          return (
            <li
              key={lang.code}
              id={`babulfish-lang-${listIndex}`}
              role="option"
              aria-selected={isActive}
              tabIndex={-1}
              onClick={() => handleSelect(lang.code)}
            >
              {renderOption(lang, isActive)}
            </li>
          )
        }

        return (
          <li
            key={lang.code}
            id={`babulfish-lang-${listIndex}`}
            role="option"
            aria-selected={isActive}
            tabIndex={-1}
            data-focused={isFocused || undefined}
            data-active={isActive || undefined}
            onClick={() => handleSelect(lang.code)}
            style={itemStyle(isActive)}
          >
            {lang.label}
            {isActive && <CheckIcon />}
          </li>
        )
      })}
    </ul>
  )
}

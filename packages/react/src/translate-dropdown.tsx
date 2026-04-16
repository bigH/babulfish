import type { Language } from "@babulfish/core"
import { useEffect, useRef, type CSSProperties, type ReactNode } from "react"
import { useOptionalTranslatorContext } from "./context.js"

export type TranslateDropdownProps = {
  readonly onSelect: (code: string) => void
  readonly onRestore?: () => void
  readonly value?: string | null
  readonly disabled?: boolean
  readonly className?: string
  readonly itemClassName?: string
  readonly renderOption?: (lang: Language, active: boolean) => ReactNode
  readonly languages?: readonly Language[]
  readonly focusedIndex?: number
}

const MISSING_DROPDOWN_LANGUAGES_ERROR =
  "TranslateDropdown requires either a languages prop or a <TranslatorProvider>"

function getItemStyle(isActive: boolean): CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0.5rem 0.75rem",
    cursor: "pointer",
    fontSize: "0.875rem",
    fontWeight: isActive ? 500 : 400,
  }
}

function DropdownOptionRow({
  id,
  isActive,
  isFocused,
  className,
  onClick,
  style,
  children,
}: {
  readonly id: string
  readonly isActive: boolean
  readonly isFocused: boolean
  readonly className?: string
  readonly onClick: () => void
  readonly style?: CSSProperties
  readonly children: ReactNode
}) {
  return (
    <li
      id={id}
      role="option"
      aria-selected={isActive}
      tabIndex={-1}
      data-focused={isFocused || undefined}
      data-active={isActive || undefined}
      className={className}
      onClick={onClick}
      style={style}
    >
      {children}
    </li>
  )
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
  itemClassName,
  renderOption,
  languages: languagesProp,
  focusedIndex = -1,
}: TranslateDropdownProps) {
  const context = useOptionalTranslatorContext()
  const languages = languagesProp ?? context?.languages

  if (!languages) {
    throw new Error(MISSING_DROPDOWN_LANGUAGES_ERROR)
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
        <DropdownOptionRow
          id="babulfish-lang-0"
          isActive={isOriginalActive}
          isFocused={focusedIndex === 0}
          className={itemClassName}
          onClick={handleRestore}
          style={getItemStyle(isOriginalActive)}
        >
          Original
          {isOriginalActive && <CheckIcon />}
        </DropdownOptionRow>
      )}
      {languages.map((lang, i) => {
        const listIndex = hasOriginal ? i + 1 : i
        const isActive = lang.code === value
        const isFocused = listIndex === focusedIndex
        const content = renderOption ? (
          renderOption(lang, isActive)
        ) : (
          <>
            {lang.label}
            {isActive && <CheckIcon />}
          </>
        )

        return (
          <DropdownOptionRow
            key={lang.code}
            id={`babulfish-lang-${listIndex}`}
            isActive={isActive}
            isFocused={isFocused}
            className={itemClassName}
            onClick={() => handleSelect(lang.code)}
            style={renderOption ? undefined : getItemStyle(isActive)}
          >
            {content}
          </DropdownOptionRow>
        )
      })}
    </ul>
  )
}

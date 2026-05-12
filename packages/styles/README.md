# @babulfish/styles

Base styles and animations for babulfish translation UI.

## Install

```bash
npm install @babulfish/styles
```

```ts
import "@babulfish/styles/css"
```

If you use `@babulfish/react` or `babulfish`, the convenience re-exports `import "@babulfish/react/css"` and `import "babulfish/css"` resolve to this same stylesheet.

## Custom properties

Override these on `:root` or any ancestor to theme babulfish UI:

| Property | Default | Description |
|---|---|---|
| `--babulfish-accent` | `var(--accent, #3b82f6)` | Primary accent color (buttons, rings, ready state) |
| `--babulfish-error` | `rgb(239 68 68)` | Error / active-translating pulse color |
| `--babulfish-border` | `var(--border, #e5e7eb)` | Border color for buttons and popups |
| `--babulfish-surface` | `var(--surface, #fff)` | Background color for buttons and popups |
| `--babulfish-muted` | `#9ca3af` | Muted icon color (idle state) |

### Theming example

```css
:root {
  --babulfish-accent: #8b5cf6;
  --babulfish-surface: #1e1e2e;
  --babulfish-border: #45475a;
  --babulfish-muted: #6c7086;
  --babulfish-error: #f38ba8;
}
```

### Using with design-system tokens

The defaults for `--babulfish-accent`, `--babulfish-border`, and `--babulfish-surface` reference `var(--accent)`, `var(--border)`, and `var(--surface)` respectively. If your design system already sets those generic tokens, babulfish picks them up with no extra configuration.

## Stock UI classes

The stylesheet includes animation and state classes for babulfish UI:

| Class | Effect |
|---|---|
| `.babulfish-pulse` | Gentle pulse during model download |
| `.babulfish-active` | Active pulse during translation |
| `.babulfish-settled` | Settle animation when translation completes |
| `.babulfish-popup` | Fade-slide-in for dropdown menus |
| `.babulfish-globe-peek` | Initial globe-button peek border and glow |
| `.babulfish-globe-peek-out` | Transition state after the initial peek |
| `.babulfish-globe-ready` | Ready-state globe-button border and glow |
| `.babulfish-icon-ready` | Ready-state icon accent color and glow |
| `.babulfish-icon-peek` | Initial peek icon color |
| `.babulfish-icon-muted` | Idle / muted icon color |

## Related packages

- [`@babulfish/core`][pkg-core] — UI-agnostic engine and contract
- [`@babulfish/react`][pkg-react] — React binding

[pkg-core]: ../core/README.md
[pkg-react]: ../react/README.md

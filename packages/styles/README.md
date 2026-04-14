# @babulfish/styles

Base styles and animations for babulfish translation UI.

## Install

```bash
npm install @babulfish/styles
```

```ts
import "@babulfish/styles/css"
```

If you use `@babulfish/react`, the convenience re-export `import "@babulfish/react/css"` resolves to this same stylesheet.

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

## Animations

The stylesheet includes keyframes used by `@babulfish/react` components:

| Class | Effect |
|---|---|
| `.babulfish-pulse` | Gentle pulse during model download |
| `.babulfish-active` | Active pulse during translation |
| `.babulfish-settled` | Settle animation when translation completes |
| `.babulfish-popup` | Fade-slide-in for dropdown menus |

## Related packages

- [`@babulfish/core`](../core/README.md) — UI-agnostic engine and contract
- [`@babulfish/react`](../react/README.md) — React binding
- [`@babulfish/demo-vanilla`](../demo-vanilla/README.md) — Zero-framework demo (imports these styles)
- [`@babulfish/demo-webcomponent`](../demo-webcomponent/README.md) — Shadow DOM custom element demo
- [Root README](../../README.md) — "Pick your binding" overview

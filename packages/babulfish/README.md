# babulfish

Permanent unscoped compat package for [`@babulfish/react`](../react/README.md).
Its runtime exports and CSS bridge match `@babulfish/react` exactly. New code should prefer the scoped package, but `babulfish` is not deprecated and is intended to remain available.

## Install

Install this inside an existing React 18 or 19 app:

```bash
npm install babulfish react react-dom @huggingface/transformers
```

```tsx
import { TranslatorProvider, useTranslator } from "babulfish"
import "babulfish/css"
```

`babulfish/css` resolves to the same stylesheet as [`@babulfish/styles/css`](../styles/README.md).

## Runtime surface

`babulfish` re-exports the same runtime names as `@babulfish/react`:

- `TranslatorProvider`
- `useTranslator`
- `useTranslateDOM`
- `TranslateButton`
- `TranslateDropdown`
- `DEFAULT_LANGUAGES`

For the actual API, hook fields, provider behavior, and DOM config semantics, read [`@babulfish/react`](../react/README.md). This package exists for import compatibility, not as a separate React API.

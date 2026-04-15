# babulfish

Convenience meta-package re-exporting [`@babulfish/react`](../react/README.md). New code should prefer `@babulfish/react` for explicit binding clarity, but `babulfish` remains a permanent compat import.

```bash
npm install babulfish react react-dom @huggingface/transformers
```

```tsx
import { TranslatorProvider, useTranslator } from "babulfish"
import "babulfish/css"
```

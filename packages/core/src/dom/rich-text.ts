import {
  isWellFormedMarkdown,
  stripInlineMarkdownMarkers,
} from "./markdown.js"
import type {
  DOMOutputTransformContext,
  DOMTranslatorConfig,
  RichTextConfig,
} from "./translator.js"

type TranslateRichContext = {
  readonly targetLang: string
  readonly signal: AbortSignal
  readonly config: RichTextConfig
  readonly translatePreservingMatches: (
    source: string,
    lang: string,
    signal: AbortSignal,
  ) => Promise<string | null>
  readonly transformDOMOutput: (
    text: string,
    ctx: DOMOutputTransformContext,
  ) => string
  readonly originalRichElements: Map<Element, string>
  readonly hooks?: DOMTranslatorConfig["hooks"]
}

export async function translateRichElement(
  el: Element,
  ctx: TranslateRichContext,
): Promise<void> {
  const {
    config,
    hooks,
    originalRichElements,
    signal,
    targetLang,
    transformDOMOutput,
    translatePreservingMatches,
  } = ctx
  const source = el.getAttribute(config.sourceAttribute)
  if (!source) return

  if (!originalRichElements.has(el)) {
    originalRichElements.set(el, el.innerHTML) // eslint-disable-line no-unsanitized/property
  }

  hooks?.onTranslateStart?.(el)

  const translated = await translatePreservingMatches(source, targetLang, signal)
  if (translated == null) return
  const transformed = transformDOMOutput(translated, {
    kind: "richText",
    targetLang,
    source,
  })

  const validate = config.validate ?? isWellFormedMarkdown
  if (validate(transformed)) {
    const render = config.render
    el.innerHTML = render(transformed) // eslint-disable-line no-unsanitized/property
  } else {
    el.textContent = stripInlineMarkdownMarkers(transformed)
  }

  hooks?.onTranslateEnd?.(el)
}

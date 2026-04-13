import { createDOMTranslator, type DOMTranslatorConfig } from "babulfish/dom"

const echoTranslate: DOMTranslatorConfig["translate"] = async (
  text,
  _targetLang,
) => text

export const domConfig: DOMTranslatorConfig = {
  translate: echoTranslate,
  roots: ["#content"],
}

export function createStandaloneDOMTranslator() {
  return createDOMTranslator(domConfig)
}

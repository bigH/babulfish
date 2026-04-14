import type {
  DevicePreference,
  ResolvedDevice,
  TranslationCapabilities,
} from "../engine/detect.js"
import { getTranslationCapabilities } from "../engine/detect.js"

type SSRCapabilities = {
  readonly ready: false
  readonly hasWebGPU: false
  readonly canTranslate: false
  readonly device: null
  readonly isMobile: false
}

type BrowserCapabilities = Readonly<
  TranslationCapabilities & {
    readonly ready: true
    readonly device: ResolvedDevice
  }
>

export type Capabilities = BrowserCapabilities | SSRCapabilities

export const SSR_CAPABILITIES: SSRCapabilities = Object.freeze({
  ready: false,
  hasWebGPU: false,
  canTranslate: false,
  device: null,
  isMobile: false,
})

function createBrowserCapabilities(
  capabilities: TranslationCapabilities,
): BrowserCapabilities {
  return Object.freeze({
    ready: true,
    ...capabilities,
  })
}

export function detectCapabilities(
  devicePreference?: DevicePreference,
): Capabilities {
  if (typeof window === "undefined") return SSR_CAPABILITIES

  return createBrowserCapabilities(
    getTranslationCapabilities(devicePreference),
  )
}

/** @experimental — subject to change */

import type { BabulfishConfig, BabulfishCore } from "../../core/babulfish.js"

/** @experimental — subject to change */
type ConformanceDriverShape = {
  readonly id: string
  create(config?: BabulfishConfig): Promise<BabulfishCore>
  dispose(core: BabulfishCore): Promise<void>
}

/** @experimental — subject to change */
export type ConformanceDriver =
  | (ConformanceDriverShape & {
    readonly supportsDOM: true
    readonly root: ParentNode | Document
  })
  | (ConformanceDriverShape & {
    readonly supportsDOM: false
  })

/** @experimental — subject to change */
export type DomConformanceDriver = Extract<
  ConformanceDriver,
  { readonly supportsDOM: true }
>

/** @experimental — subject to change */
export type NonDomConformanceDriver = Extract<
  ConformanceDriver,
  { readonly supportsDOM: false }
>

/** @experimental — subject to change */
export type ConformanceScenario = {
  readonly id: string
  readonly description: string
  readonly requiresDOM?: boolean
  readonly run: (driver: ConformanceDriver) => Promise<void>
}

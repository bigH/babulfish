/** @experimental — subject to change */

import type { BabulfishConfig, BabulfishCore } from "../../core/babulfish.js"

/** @experimental — subject to change */
type ConformanceDriverBase = {
  readonly id: string
  create(config?: BabulfishConfig): Promise<BabulfishCore>
  dispose(core: BabulfishCore): Promise<void>
}

/** @experimental — subject to change */
export type DomConformanceDriver = ConformanceDriverBase & {
  readonly supportsDOM: true
  readonly root: ParentNode | Document
}

/** @experimental — subject to change */
export type NonDomConformanceDriver = ConformanceDriverBase & {
  readonly supportsDOM: false
}

/** @experimental — subject to change */
export type ConformanceDriver = DomConformanceDriver | NonDomConformanceDriver

/** @experimental — subject to change */
export type ConformanceScenario = {
  readonly id: string
  readonly description: string
  readonly requiresDOM?: boolean
  readonly run: (driver: ConformanceDriver) => Promise<void>
}

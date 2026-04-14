/** @experimental — subject to change */

import type { BabulfishConfig, BabulfishCore } from "../../core/index.js"

/** @experimental — subject to change */
export interface ConformanceDriver {
  readonly id: string
  readonly supportsDOM?: boolean
  create(config?: BabulfishConfig): Promise<BabulfishCore>
  dispose(core: BabulfishCore): Promise<void>
  readonly root?: ParentNode | Document
}

/** @experimental — subject to change */
export type ConformanceScenario = {
  readonly id: string
  readonly description: string
  readonly requiresDOM?: boolean
  readonly run: (driver: ConformanceDriver) => Promise<void>
}

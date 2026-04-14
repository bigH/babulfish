/** @experimental — subject to change */

import { createBabulfish } from "../../core/index.js"
import type { BabulfishConfig, BabulfishCore } from "../../core/index.js"
import type { ConformanceDriver } from "./types.js"

/** @experimental — subject to change */
export function createDirectDriver(): ConformanceDriver {
  return {
    id: "direct",
    async create(config?: BabulfishConfig) {
      return createBabulfish(config)
    },
    async dispose(core: BabulfishCore) {
      await core.dispose()
    },
  }
}

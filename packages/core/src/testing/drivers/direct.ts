/** @experimental — subject to change */

import { createBabulfish } from "../../core/babulfish.js"
import type { BabulfishConfig, BabulfishCore } from "../../core/babulfish.js"
import type { ConformanceDriver } from "./types.js"

/** @experimental — subject to change */
export function createDirectDriver(): ConformanceDriver {
  return {
    id: "direct",
    supportsDOM: false,
    async create(config?: BabulfishConfig) {
      const { dom: _dom, ...directConfig } = config ?? {}
      return createBabulfish(directConfig)
    },
    async dispose(core: BabulfishCore) {
      await core.dispose()
    },
  }
}

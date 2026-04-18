/** @experimental — subject to change */

import { createBabulfish } from "../../core/babulfish.js"
import type { BabulfishConfig, BabulfishCore } from "../../core/babulfish.js"
import type { NonDomConformanceDriver } from "./types.js"

/** @experimental — subject to change */
export function createDirectDriver(): NonDomConformanceDriver {
  return {
    id: "direct",
    supportsDOM: false,
    async create(config?: BabulfishConfig) {
      if (!config) return createBabulfish()
      const { dom: _ignoredDom, ...rest } = config
      return createBabulfish(rest)
    },
    async dispose(core: BabulfishCore) {
      await core.dispose()
    },
  }
}

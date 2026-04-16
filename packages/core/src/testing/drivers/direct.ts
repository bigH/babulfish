/** @experimental — subject to change */

import { createBabulfish } from "../../core/babulfish.js"
import type { BabulfishConfig, BabulfishCore } from "../../core/babulfish.js"
import type { NonDomConformanceDriver } from "./types.js"

/** @experimental — subject to change */
export function createDirectDriver(): NonDomConformanceDriver {
  return {
    id: "direct",
    supportsDOM: false,
    create(config?: BabulfishConfig) {
      if (config?.dom == null) return Promise.resolve(createBabulfish(config))
      const { dom: _ignoredDom, ...configWithoutDom } = config
      return Promise.resolve(createBabulfish(configWithoutDom))
    },
    dispose(core: BabulfishCore) {
      return core.dispose()
    },
  }
}

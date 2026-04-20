/** @experimental — subject to change */

import { createBabulfish } from "../../core/babulfish.js"
import type { BabulfishConfig, BabulfishCore } from "../../core/babulfish.js"
import type { NonDomConformanceDriver } from "./types.js"

function stripDomConfig(config?: BabulfishConfig): BabulfishConfig | undefined {
  if (config?.dom == null) return config
  const { dom: _ignoredDom, ...configWithoutDom } = config
  return configWithoutDom
}

/** @experimental — subject to change */
export function createDirectDriver(): NonDomConformanceDriver {
  return {
    id: "direct",
    supportsDOM: false,
    async create(config?: BabulfishConfig) {
      return createBabulfish(stripDomConfig(config))
    },
    dispose(core: BabulfishCore) {
      return core.dispose()
    },
  }
}

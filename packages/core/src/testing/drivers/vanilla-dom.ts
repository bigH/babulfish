/** @experimental — subject to change */

import { createBabulfish } from "../../core/babulfish.js"
import type { BabulfishConfig, BabulfishCore } from "../../core/babulfish.js"
import type { ConformanceDriver } from "./types.js"

/** @experimental — subject to change */
export function createVanillaDomDriver(
  root?: ParentNode | Document,
): ConformanceDriver {
  const domRoot = root ?? document
  return {
    id: "vanilla-dom",
    supportsDOM: true,
    get root() {
      return domRoot
    },
    async create(config?: BabulfishConfig) {
      const { root: _ignoredRoot, roots: _ignoredRoots, ...domConfig } = config?.dom ?? {}
      return createBabulfish({
        ...config,
        dom: {
          ...domConfig,
          roots: ["#app"],
          root: domRoot,
        },
      })
    },
    async dispose(core: BabulfishCore) {
      await core.dispose()
    },
  }
}

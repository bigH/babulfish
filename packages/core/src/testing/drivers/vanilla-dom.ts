/** @experimental — subject to change */

import { createBabulfish } from "../../core/babulfish.js"
import type { BabulfishConfig, BabulfishCore } from "../../core/babulfish.js"
import type { DomConformanceDriver } from "./types.js"

function createPinnedDomConfig(
  root: ParentNode | Document,
  dom?: BabulfishConfig["dom"],
): NonNullable<BabulfishConfig["dom"]> {
  const { root: _ignoredRoot, roots: _ignoredRoots, ...domConfig } = dom ?? {}
  return {
    ...domConfig,
    roots: ["#app"],
    root,
  }
}

/** @experimental — subject to change */
export function createVanillaDomDriver(
  root?: ParentNode | Document,
): DomConformanceDriver {
  const domRoot = root ?? document
  return {
    id: "vanilla-dom",
    supportsDOM: true,
    root: domRoot,
    async create(config?: BabulfishConfig) {
      return createBabulfish({
        ...config,
        dom: createPinnedDomConfig(domRoot, config?.dom),
      })
    },
    async dispose(core: BabulfishCore) {
      await core.dispose()
    },
  }
}

import path from "node:path"
import { fileURLToPath } from "node:url"

import type { NextConfig } from "next"

const demoDir = path.dirname(fileURLToPath(import.meta.url))
const babulfishSrcDir = path.resolve(demoDir, "../babulfish/src")

const config: NextConfig = {
  experimental: {
    externalDir: true,
  },
  transpilePackages: ["babulfish"],
  webpack: (webpackConfig) => {
    webpackConfig.resolve ??= {}
    webpackConfig.resolve.extensionAlias = {
      ...(webpackConfig.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    }
    webpackConfig.resolve.alias = {
      ...(webpackConfig.resolve.alias as Record<string, string | false>),
      "babulfish$": path.join(babulfishSrcDir, "index.ts"),
      "babulfish/react$": path.join(babulfishSrcDir, "react/index.ts"),
      "babulfish/dom$": path.join(babulfishSrcDir, "dom/index.ts"),
      "babulfish/engine$": path.join(babulfishSrcDir, "engine/index.ts"),
    }

    return webpackConfig
  },
}

export default config

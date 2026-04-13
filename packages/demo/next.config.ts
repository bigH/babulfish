import path from "node:path"
import { fileURLToPath } from "node:url"

import type { NextConfig } from "next"

const demoDir = path.dirname(fileURLToPath(import.meta.url))
const babulfishSrcDir = path.resolve(demoDir, "../babulfish/src")

const config: NextConfig = {
  experimental: {
    externalDir: true,
  },
  // Revisit these before adding third-party embeds or opener-dependent flows
  // such as OAuth or payment popups.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Cross-Origin-Opener-Policy",
            value: "same-origin",
          },
          {
            key: "Cross-Origin-Embedder-Policy",
            value: "require-corp",
          },
        ],
      },
    ]
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

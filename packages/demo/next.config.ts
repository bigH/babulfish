import path from "node:path"
import { fileURLToPath } from "node:url"

import type { NextConfig } from "next"

const demoDir = path.dirname(fileURLToPath(import.meta.url))
const coreSrcDir = path.resolve(demoDir, "../core/src")
const reactSrcDir = path.resolve(demoDir, "../react/src")
const demoSourceAliases: Record<string, string> = {
  "@babulfish/react$": path.join(reactSrcDir, "index.ts"),
  "@babulfish/core$": path.join(coreSrcDir, "index.ts"),
  "@babulfish/core/engine$": path.join(coreSrcDir, "engine/index.ts"),
}

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
  transpilePackages: ["@babulfish/react", "@babulfish/core"],
  webpack: (webpackConfig) => {
    webpackConfig.resolve ??= {}
    webpackConfig.resolve.alias ??= {}
    webpackConfig.resolve.extensionAlias = {
      ...(webpackConfig.resolve.extensionAlias ?? {}),
      ".js": [".ts", ".tsx", ".js"],
    }
    webpackConfig.resolve.alias = {
      ...webpackConfig.resolve.alias,
      ...demoSourceAliases,
    }

    return webpackConfig
  },
}

export default config

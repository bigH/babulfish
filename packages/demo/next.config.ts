import path from "node:path"
import { fileURLToPath } from "node:url"

import type { NextConfig } from "next"

const demoDir = path.dirname(fileURLToPath(import.meta.url))
const demoSourcePackages = {
  core: {
    packageName: "@babulfish/core",
    srcDir: path.resolve(demoDir, "../core/src"),
  },
  react: {
    packageName: "@babulfish/react",
    srcDir: path.resolve(demoDir, "../react/src"),
  },
} as const
const transpilePackages = Object.values(demoSourcePackages).map(
  ({ packageName }) => packageName,
)
const demoSourceAliases = {
  ...Object.fromEntries(
    Object.values(demoSourcePackages).map(({ packageName, srcDir }) => [
      `${packageName}$`,
      path.join(srcDir, "index.ts"),
    ]),
  ),
  "@babulfish/core/engine$": path.join(
    demoSourcePackages.core.srcDir,
    "engine/index.ts",
  ),
} satisfies Record<string, string>

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
  transpilePackages,
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

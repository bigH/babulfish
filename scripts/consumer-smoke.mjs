import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cleanupTargets = new Set()
const EXPECTED_CORE_SNAPSHOT_KEYS = [
  "capabilities",
  "currentLanguage",
  "enablement",
  "model",
  "translation",
]
const EXPECTED_CORE_RUNTIME_KEYS = [
  "DEFAULT_LANGUAGES",
  "IDLE_ENABLEMENT_STATE",
  "NOT_RUN_PROBE_SUMMARY",
  "createBabulfish",
  "createDOMTranslator",
  "createEnablementCompat",
  "createEngine",
  "getTranslationCapabilities",
  "isWellFormedMarkdown",
  "parseInlineMarkdown",
  "renderInlineMarkdownToHtml",
]
const EXPECTED_CORE_DOM_RUNTIME_KEYS = [
  "createDOMTranslator",
  "isWellFormedMarkdown",
  "parseInlineMarkdown",
  "renderInlineMarkdownToHtml",
]
const EXPECTED_REACT_RUNTIME_KEYS = [
  "DEFAULT_LANGUAGES",
  "TranslateButton",
  "TranslateDropdown",
  "TranslatorProvider",
  "useTranslateDOM",
  "useTranslator",
]
const CSS_BRIDGE_IMPORT = '@import "@babulfish/styles/css";'

function normalizeCssBridge(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
}

function registerCleanup(target) {
  cleanupTargets.add(target)
  return target
}

function cleanup() {
  for (const target of cleanupTargets) {
    rmSync(target, { force: true, recursive: true })
  }
}

function run(command, args, cwd = rootDir) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function runNode(code, cwd) {
  return run("node", ["--input-type=module", "-e", code], cwd)
}

function assertCssBridge(specifier, source) {
  assert(
    normalizeCssBridge(source) === CSS_BRIDGE_IMPORT,
    `${specifier} should be a pure bridge to @babulfish/styles/css`,
  )
}

function packPackage(packageName, packDir) {
  const output = run("pnpm", [
    "--filter",
    packageName,
    "pack",
    "--pack-destination",
    packDir,
    "--json",
  ])
  const packed = JSON.parse(output)
  const filename = Array.isArray(packed) ? packed[0]?.filename : packed?.filename
  assert(
    typeof filename === "string" && filename.length > 0,
    `Missing tarball filename for ${packageName}`,
  )
  return filename
}

function writePackageJson(projectDir, dependencies) {
  // Force every internal dependency edge to resolve from the packed tarballs.
  // Without this, pnpm can silently fetch already-published versions from npm,
  // which makes the smoke pass for the wrong reason.
  writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        name: "consumer-smoke",
        private: true,
        type: "module",
        dependencies,
        pnpm: {
          overrides: dependencies,
        },
      },
      null,
      2,
    ),
  )
}

function phaseHeader(label) {
  console.log(`== ${label} ==`)
}

process.on("exit", cleanup)
process.on("SIGINT", () => {
  cleanup()
  process.exit(130)
})
process.on("SIGTERM", () => {
  cleanup()
  process.exit(143)
})

phaseHeader("Building published packages")
for (const packageName of ["@babulfish/core", "@babulfish/react", "babulfish"]) {
  console.log(`OK [build]: ${packageName}`)
  run("pnpm", ["--filter", packageName, "build"])
}

const packDir = registerCleanup(mkdtempSync(path.join(tmpdir(), "babulfish-pack-")))
phaseHeader("Packing tarballs")
const tarballs = {
  core: packPackage("@babulfish/core", packDir),
  react: packPackage("@babulfish/react", packDir),
  styles: packPackage("@babulfish/styles", packDir),
  meta: packPackage("babulfish", packDir),
}

for (const [name, tarballPath] of Object.entries(tarballs)) {
  assert(tarballPath.endsWith(".tgz"), `Expected ${name} tarball to end with .tgz`)
  console.log(`OK [pack]: ${name} -> ${path.basename(tarballPath)}`)
}

const projectDir = registerCleanup(mkdtempSync(path.join(tmpdir(), "babulfish-consumer-")))
writePackageJson(projectDir, {
  "@babulfish/core": `file:${tarballs.core}`,
  "@babulfish/react": `file:${tarballs.react}`,
  "@babulfish/styles": `file:${tarballs.styles}`,
  babulfish: `file:${tarballs.meta}`,
})

phaseHeader("Installing tarballs without React")
run(
  "pnpm",
  [
    "install",
    "--no-frozen-lockfile",
    "--config.auto-install-peers=false",
  ],
  projectDir,
)

const reactFreeOutput = runNode(
  `
import { readFileSync } from "node:fs"

const expectedCoreSnapshotKeys = ${JSON.stringify(EXPECTED_CORE_SNAPSHOT_KEYS)}
const expectedCoreKeys = ${JSON.stringify(EXPECTED_CORE_RUNTIME_KEYS)}
const expectedCoreDomKeys = ${JSON.stringify(EXPECTED_CORE_DOM_RUNTIME_KEYS)}
const cssBridgeImport = ${JSON.stringify(CSS_BRIDGE_IMPORT)}

function ok(message) {
  console.log(message)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

${normalizeCssBridge.toString()}

function assertCssBridge(specifier, source) {
  assert(
    normalizeCssBridge(source) === cssBridgeImport,
    specifier + " should be a pure bridge to @babulfish/styles/css",
  )
}

const coreModule = await import("@babulfish/core")
assert(typeof coreModule.createBabulfish === "function", "createBabulfish missing")
assert(
  JSON.stringify(Object.keys(coreModule).toSorted()) === JSON.stringify(expectedCoreKeys),
  "@babulfish/core runtime exports drifted",
)
const core = coreModule.createBabulfish()
assert(typeof core.loadModel === "function", "loadModel missing")
assert(typeof core.translateTo === "function", "translateTo missing")
assert(typeof core.translateText === "function", "translateText missing")
assert(typeof core.restore === "function", "restore missing")
assert(typeof core.abort === "function", "abort missing")
assert(typeof core.subscribe === "function", "subscribe missing")
assert(typeof core.dispose === "function", "dispose missing")
assert(typeof core.snapshot === "object" && core.snapshot !== null, "snapshot missing")
assert(
  JSON.stringify(Object.keys(core.snapshot).toSorted()) === JSON.stringify(expectedCoreSnapshotKeys),
  "snapshot shape drifted",
)
assert(Array.isArray(core.languages), "languages missing")
assert(core.languages.length > 0, "languages should not be empty")
await core.dispose()
ok("OK [@babulfish/core]: createBabulfish contract present")

const testingModule = await import("@babulfish/core/testing")
const driver = testingModule.createDirectDriver()
const scenario = testingModule.scenariosForDriver(driver).find(
  (candidate) => candidate.id === "snapshot-no-spurious-notify",
)
assert(scenario, "snapshot-no-spurious-notify scenario missing")
await scenario.run(driver)
ok("OK [@babulfish/core/testing]: direct-driver scenario passed")

const domModule = await import("@babulfish/core/dom")
assert(
  JSON.stringify(Object.keys(domModule).toSorted()) === JSON.stringify(expectedCoreDomKeys),
  "@babulfish/core/dom runtime exports drifted",
)
assert(
  coreModule.createDOMTranslator === domModule.createDOMTranslator,
  "@babulfish/core should re-export createDOMTranslator",
)
await import("@babulfish/core/engine")
ok("OK [@babulfish/core/dom]: documented runtime surface present")
ok("OK [@babulfish/core/engine]: import succeeds")

let missingReact = false
try {
  await import("react")
} catch (error) {
  missingReact = true
}
assert(missingReact, "react unexpectedly installed in React-free project")
ok("OK [react]: absent in React-free install")

const stylesCss = import.meta.resolve("@babulfish/styles/css")
const reactCss = import.meta.resolve("@babulfish/react/css")
const metaCss = import.meta.resolve("babulfish/css")
assert(stylesCss.endsWith(".css"), "@babulfish/styles/css should resolve to a css file")
assert(reactCss.endsWith(".css"), "@babulfish/react/css should resolve to a css file")
assert(metaCss.endsWith(".css"), "babulfish/css should resolve to a css file")
assertCssBridge("@babulfish/react/css", readFileSync(new URL(reactCss), "utf8"))
assertCssBridge("babulfish/css", readFileSync(new URL(metaCss), "utf8"))
const stylesSource = readFileSync(new URL(stylesCss), "utf8")
for (const marker of [
  "--babulfish-accent",
  "--babulfish-error",
  "--babulfish-border",
  "--babulfish-surface",
  "--babulfish-muted",
  ".babulfish-pulse",
  ".babulfish-active",
  ".babulfish-settled",
  ".babulfish-popup",
]) {
  assert(stylesSource.includes(marker), "@babulfish/styles/css missing documented marker: " + marker)
}
ok("OK [css]: styles/react/meta css specifiers resolve")

for (const specifier of ["@babulfish/react", "babulfish"]) {
  let failed = false
  try {
    await import(specifier)
  } catch (error) {
    failed = true
  }
  assert(failed, specifier + " should fail without react installed")
  ok("OK [" + specifier + "]: fails without react")
}
  `,
  projectDir,
)

process.stdout.write(`${reactFreeOutput}\n`)

phaseHeader("Installing React for positive-path imports")
run(
  "pnpm",
  [
    "add",
    "react@19.1.0",
    "react-dom@19.1.0",
    "--config.auto-install-peers=false",
  ],
  projectDir,
)

const reactInstalledOutput = runNode(
  `
import React from "react"
import { renderToString } from "react-dom/server"

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const expectedReactKeys = ${JSON.stringify(EXPECTED_REACT_RUNTIME_KEYS)}

const reactModule = await import("@babulfish/react")
const metaModule = await import("babulfish")

const reactKeys = Object.keys(reactModule).toSorted()
const metaKeys = Object.keys(metaModule).toSorted()
assert(
  JSON.stringify(reactKeys) === JSON.stringify(expectedReactKeys),
  "@babulfish/react runtime exports drifted",
)
assert(
  JSON.stringify(reactKeys) === JSON.stringify(metaKeys),
  "babulfish and @babulfish/react should expose the same runtime keys",
)
assert(
  JSON.stringify(metaKeys) === JSON.stringify(expectedReactKeys),
  "babulfish runtime exports drifted",
)

function InspectWith({ module }) {
  const state = module.useTranslator()
  return React.createElement(
    "span",
    null,
    [
      state.model.status,
      state.translation.status,
      state.currentLanguage ?? "null",
      String(state.languages.length),
      String(state.capabilitiesReady),
    ].join("|"),
  )
}

const reactSsrHtml = renderToString(
  React.createElement(
    reactModule.TranslatorProvider,
    null,
    React.createElement(InspectWith, { module: reactModule }),
  ),
)
assert(
  reactSsrHtml.includes("idle|idle|null|0|false"),
  "@babulfish/react SSR fallback drifted",
)

const metaSsrHtml = renderToString(
  React.createElement(
    metaModule.TranslatorProvider,
    null,
    React.createElement(InspectWith, { module: metaModule }),
  ),
)
assert(
  metaSsrHtml.includes("idle|idle|null|0|false"),
  "babulfish SSR fallback drifted",
)

console.log("OK [@babulfish/react]: imports once react is installed")
console.log("OK [babulfish]: matches @babulfish/react runtime surface")
console.log("OK [react-ssr]: provider fallback renders on the server")
  `,
  projectDir,
)

process.stdout.write(`${reactInstalledOutput}\n`)
phaseHeader("Consumer smoke passed")

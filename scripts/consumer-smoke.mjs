import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const cleanupTargets = new Set()

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

function ok(message) {
  console.log(message)
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const coreModule = await import("@babulfish/core")
assert(typeof coreModule.createBabulfish === "function", "createBabulfish missing")
const core = coreModule.createBabulfish()
assert(typeof core.subscribe === "function", "subscribe missing")
assert(typeof core.dispose === "function", "dispose missing")
assert(typeof core.snapshot === "object" && core.snapshot !== null, "snapshot missing")
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

await import("@babulfish/core/dom")
await import("@babulfish/core/engine")
ok("OK [@babulfish/core/dom]: import succeeds")
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
assert(
  readFileSync(new URL(reactCss), "utf8").includes('@import "@babulfish/styles/css";'),
  "@babulfish/react/css should bridge to @babulfish/styles/css",
)
assert(
  readFileSync(new URL(metaCss), "utf8").includes('@import "@babulfish/styles/css";'),
  "babulfish/css should bridge to @babulfish/styles/css",
)
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
function assert(condition, message) {
  if (!condition) throw new Error(message)
}

const reactModule = await import("@babulfish/react")
const metaModule = await import("babulfish")

const reactKeys = Object.keys(reactModule).toSorted()
const metaKeys = Object.keys(metaModule).toSorted()
assert(reactKeys.length > 0, "@babulfish/react should export a public surface")
assert(
  JSON.stringify(reactKeys) === JSON.stringify(metaKeys),
  "babulfish and @babulfish/react should expose the same runtime keys",
)

console.log("OK [@babulfish/react]: imports once react is installed")
console.log("OK [babulfish]: matches @babulfish/react runtime surface")
  `,
  projectDir,
)

process.stdout.write(`${reactInstalledOutput}\n`)
phaseHeader("Consumer smoke passed")

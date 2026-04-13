import assert from "node:assert/strict"
import { execFileSync, spawnSync } from "node:child_process"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const scriptDir = path.dirname(fileURLToPath(import.meta.url))
const packageDir = path.resolve(scriptDir, "..")
const readmePath = path.join(packageDir, "README.md")
const distIndexPath = path.join(packageDir, "dist", "index.js")

function assertReadmeContract() {
  const readme = readFileSync(readmePath, "utf8")

  for (const snippet of [
    "### Full React surface (`babulfish`)",
    "The root `babulfish` entrypoint is the batteries-included React surface.",
    "`react` must be installed at module resolution time.",
    "### Engine only (`babulfish/engine`)",
    "### DOM only (`babulfish/dom`)",
    "Import styles separately from `babulfish/css`.",
    "Import `babulfish/engine` and/or `babulfish/dom` directly.",
  ]) {
    assert.ok(
      readme.includes(snippet),
      `README is missing expected import guidance: ${snippet}`,
    )
  }
}

function runNode(scriptPath, cwd) {
  return spawnSync(process.execPath, [scriptPath], {
    cwd,
    encoding: "utf8",
  })
}

assert.ok(
  existsSync(distIndexPath),
  "Missing build output. Run `pnpm --filter babulfish build` before this smoke check.",
)
assertReadmeContract()

const tempDir = mkdtempSync(path.join(tmpdir(), "babulfish-consumer-"))
let tarballPath = null

try {
  const [packResult] = JSON.parse(
    execFileSync("npm", ["pack", "--json", "--pack-destination", tempDir], {
      cwd: packageDir,
      encoding: "utf8",
    }),
  )
  tarballPath = path.join(tempDir, packResult.filename)

  writeFileSync(
    path.join(tempDir, "package.json"),
    JSON.stringify(
      {
        name: "babulfish-consumer-smoke",
        private: true,
        type: "module",
      },
      null,
      2,
    ) + "\n",
  )

  execFileSync("npm", ["install", "--no-package-lock", tarballPath], {
    cwd: tempDir,
    encoding: "utf8",
  })

  const subpathScriptPath = path.join(tempDir, "subpath-check.mjs")
  writeFileSync(
    subpathScriptPath,
    `import { createEngine } from "babulfish/engine"
import { createDOMTranslator } from "babulfish/dom"

const engine = createEngine({ device: "wasm" })
if (engine.status !== "idle") {
  throw new Error("Expected engine-only import to work without React")
}

const domTranslator = createDOMTranslator({
  translate: async (text) => text,
  roots: ["#content"],
})

if (domTranslator.isTranslating !== false) {
  throw new Error("Expected DOM-only import to work without React")
}

engine.dispose()
domTranslator.abort()
`,
  )

  const subpathResult = runNode(subpathScriptPath, tempDir)
  assert.equal(
    subpathResult.status,
    0,
    [
      "Subpath imports should work without React installed.",
      subpathResult.stderr.trim(),
      subpathResult.stdout.trim(),
    ].filter(Boolean).join("\n"),
  )

  const rootScriptPath = path.join(tempDir, "root-import-check.mjs")
  writeFileSync(rootScriptPath, 'await import("babulfish")\n')

  const rootResult = runNode(rootScriptPath, tempDir)
  assert.notEqual(
    rootResult.status,
    0,
    "Root `babulfish` import unexpectedly worked without React installed.",
  )
  assert.match(
    `${rootResult.stderr}\n${rootResult.stdout}`,
    /react/i,
    "Root import should fail because React is not installed in the consumer.",
  )
} finally {
  if (tarballPath) {
    rmSync(tarballPath, { force: true })
  }
  rmSync(tempDir, { recursive: true, force: true })
}

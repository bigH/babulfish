import { execFileSync } from "node:child_process"
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

export const PUBLIC_PACKAGES = Object.freeze([
  Object.freeze({
    name: "@babulfish/styles",
    dir: "packages/styles",
  }),
  Object.freeze({
    name: "@babulfish/core",
    dir: "packages/core",
  }),
  Object.freeze({
    name: "@babulfish/react",
    dir: "packages/react",
  }),
  Object.freeze({
    name: "babulfish",
    dir: "packages/babulfish",
  }),
])

export const PACKAGE_README_LINKS = Object.freeze({
  "pkg-core": Object.freeze({
    local: "../core/README.md",
    npm: "https://www.npmjs.com/package/@babulfish/core",
  }),
  "pkg-react": Object.freeze({
    local: "../react/README.md",
    npm: "https://www.npmjs.com/package/@babulfish/react",
  }),
  "pkg-styles": Object.freeze({
    local: "../styles/README.md",
    npm: "https://www.npmjs.com/package/@babulfish/styles",
  }),
  "pkg-babulfish": Object.freeze({
    local: "../babulfish/README.md",
    npm: "https://www.npmjs.com/package/babulfish",
  }),
})

const packageByName = new Map(PUBLIC_PACKAGES.map((pkg) => [pkg.name, pkg]))
const forbiddenLocalReadmes = new Set(
  Object.values(PACKAGE_README_LINKS).map((link) => link.local),
)

function run(command, args, cwd = rootDir) {
  return execFileSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim()
}

function parseReferenceDefinition(line) {
  const match = line.match(/^\[([^\]]+)\]:\s+(\S+)\s*$/)
  if (!match) return null
  return { label: match[1], target: match[2] }
}

function findPackageReferenceUses(line) {
  const labels = new Set()
  const pattern = /\[[^\]]+\]\[(pkg-[^\]]+)\]/g

  for (const match of line.matchAll(pattern)) {
    if (Object.hasOwn(PACKAGE_README_LINKS, match[1])) {
      labels.add(match[1])
    }
  }

  return labels
}

function fenceMarker(line) {
  const match = line.match(/^(?: {0,3})(`{3,}|~{3,})/)
  return match?.[1][0] ?? null
}

function transformMarkdownLines(markdown, transformLine) {
  const parts = markdown.split(/(\r?\n)/)
  let fence = null
  let result = ""

  for (let index = 0; index < parts.length; index += 2) {
    const line = parts[index]
    const newline = parts[index + 1] ?? ""
    const marker = fenceMarker(line)

    if (marker && !fence) {
      fence = marker
      result += line + newline
      continue
    }

    if (marker && marker === fence) {
      fence = null
      result += line + newline
      continue
    }

    result += (fence ? line : transformLine(line)) + newline
  }

  return result
}

function knownLocalDefinition(label) {
  const link = PACKAGE_README_LINKS[label]
  if (!link) return null
  return `[${label}]: ${link.local}`
}

function knownNpmDefinition(label) {
  const link = PACKAGE_README_LINKS[label]
  if (!link) return null
  return `[${label}]: ${link.npm}`
}

function expectedLabelForLocalPath(localPath) {
  return Object.entries(PACKAGE_README_LINKS).find(
    ([, link]) => link.local === localPath,
  )?.[0]
}

function assertNoRemainingLocalReadmePath(markdown, context) {
  for (const localPath of forbiddenLocalReadmes) {
    if (markdown.includes(localPath)) {
      throw new Error(
        `${context} has forbidden local public package README path: ${localPath}`,
      )
    }
  }
}

function packedFilenameFromJson(output, packageName) {
  const packed = JSON.parse(output)
  const filename = Array.isArray(packed) ? packed[0]?.filename : packed?.filename

  if (typeof filename !== "string" || filename.length === 0) {
    throw new Error(`Missing tarball filename for ${packageName}`)
  }

  return filename
}

function assertNoPackageDirectoryEntry(tarballPath) {
  const entries = run("tar", ["-tzf", tarballPath]).split("\n")
  if (entries.includes("package/")) {
    throw new Error(`${path.basename(tarballPath)} contains unsupported package/ tar entry`)
  }
}

export function rewritePackageReadmeLinks(markdown) {
  return transformMarkdownLines(markdown, (line) => {
    for (const label of Object.keys(PACKAGE_README_LINKS)) {
      if (line === knownLocalDefinition(label)) {
        return knownNpmDefinition(label)
      }
    }

    return line
  })
}

export function assertSourcePublicReadme(markdown, readmePath) {
  const usedLabels = new Set()
  const definedLabels = new Set()

  transformMarkdownLines(markdown, (line) => {
    for (const label of findPackageReferenceUses(line)) {
      usedLabels.add(label)
    }

    const definition = parseReferenceDefinition(line)

    if (definition && Object.hasOwn(PACKAGE_README_LINKS, definition.label)) {
      definedLabels.add(definition.label)
      const expected = PACKAGE_README_LINKS[definition.label].local
      if (definition.target !== expected) {
        throw new Error(
          `${readmePath} has wrong source target for ${definition.label}; expected ${expected}`,
        )
      }
      return line
    }

    for (const localPath of forbiddenLocalReadmes) {
      if (!line.includes(localPath)) continue

      const expectedLabel = expectedLabelForLocalPath(localPath)
      throw new Error(
        `${readmePath} has forbidden inline or unknown local public package README link ${localPath}; use [${expectedLabel}]: ${localPath}`,
      )
    }

    return line
  })

  for (const label of usedLabels) {
    if (!definedLabels.has(label)) {
      throw new Error(
        `${readmePath} uses [${label}] but does not define it as ${knownLocalDefinition(label)}`,
      )
    }
  }
}

export function assertPackedPublicReadme(markdown, tarballPath) {
  assertNoRemainingLocalReadmePath(markdown, tarballPath)
  const usedLabels = new Set()
  const definedLabels = new Set()

  transformMarkdownLines(markdown, (line) => {
    for (const label of findPackageReferenceUses(line)) {
      usedLabels.add(label)
    }

    const definition = parseReferenceDefinition(line)

    if (definition && Object.hasOwn(PACKAGE_README_LINKS, definition.label)) {
      definedLabels.add(definition.label)
      const expected = PACKAGE_README_LINKS[definition.label].npm
      if (definition.target !== expected) {
        throw new Error(
          `${tarballPath} has wrong packed target for ${definition.label}; expected ${expected}`,
        )
      }
    }

    return line
  })

  for (const label of usedLabels) {
    if (!definedLabels.has(label)) {
      throw new Error(
        `${tarballPath} uses [${label}] but does not define it as ${knownNpmDefinition(label)}`,
      )
    }
  }
}

export function packPublicPackage(packageName, outDir) {
  const publicPackage = packageByName.get(packageName)
  if (!publicPackage) {
    throw new Error(`Unknown public package: ${packageName}`)
  }

  const sourceReadmePath = path.join(rootDir, publicPackage.dir, "README.md")
  assertSourcePublicReadme(
    readFileSync(sourceReadmePath, "utf8"),
    path.relative(rootDir, sourceReadmePath),
  )

  const output = run("pnpm", [
    "--filter",
    packageName,
    "pack",
    "--pack-destination",
    outDir,
    "--json",
  ])
  const filename = packedFilenameFromJson(output, packageName)
  const tarballPath = path.isAbsolute(filename) ? filename : path.resolve(rootDir, filename)
  const workDir = mkdtempSync(path.join(tmpdir(), "babulfish-readme-pack-"))

  try {
    const extractDir = path.join(workDir, "extract")
    mkdirSync(extractDir)
    run("tar", ["-xzf", tarballPath, "-C", extractDir])

    const packedReadmePath = path.join(extractDir, "package", "README.md")
    const rewrittenReadme = rewritePackageReadmeLinks(
      readFileSync(packedReadmePath, "utf8"),
    )
    assertPackedPublicReadme(rewrittenReadme, path.basename(tarballPath))
    writeFileSync(packedReadmePath, rewrittenReadme)

    const rewrittenOutput = run("npm", [
      "pack",
      path.join(extractDir, "package"),
      "--pack-destination",
      workDir,
      "--json",
    ])
    const rewrittenFilename = packedFilenameFromJson(rewrittenOutput, packageName)
    const rewrittenTarball = path.resolve(workDir, rewrittenFilename)
    assertNoPackageDirectoryEntry(rewrittenTarball)
    renameSync(rewrittenTarball, tarballPath)
  } finally {
    rmSync(workDir, { force: true, recursive: true })
  }

  return tarballPath
}

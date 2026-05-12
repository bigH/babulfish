import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { PUBLIC_PACKAGES, packPublicPackage } from "./package-readmes.mjs"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dryRun = process.argv.includes("--dry-run")
const noGitChecks = process.argv.includes("--no-git-checks")
const unknownArgs = process.argv
  .slice(2)
  .filter((arg) => arg !== "--dry-run" && arg !== "--no-git-checks")

if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(", ")}`)
}

if (noGitChecks && !dryRun) {
  throw new Error("--no-git-checks is only allowed with --dry-run")
}

function run(command, args, options = {}) {
  const output = execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  })
  return output === null ? "" : output.trim()
}

function packageVersion(publicPackage) {
  const manifestPath = path.join(rootDir, publicPackage.dir, "package.json")
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"))

  if (typeof manifest.version !== "string" || manifest.version.length === 0) {
    throw new Error(`${publicPackage.dir}/package.json is missing version`)
  }

  return manifest.version
}

function publishedVersion(name, version) {
  try {
    return run("npm", ["view", `${name}@${version}`, "version"])
  } catch (error) {
    return null
  }
}

function assertCleanGitWorktree() {
  const status = run("git", ["status", "--porcelain"])
  if (status.length > 0) {
    throw new Error("Refusing to publish from a dirty git worktree")
  }
}

if (!noGitChecks) {
  assertCleanGitWorktree()
}

const packDir = mkdtempSync(path.join(tmpdir(), "babulfish-release-pack-"))

try {
  const tarballs = PUBLIC_PACKAGES.map((publicPackage) => {
    const tarball = packPublicPackage(publicPackage.name, packDir)
    console.log(`OK [pack]: ${publicPackage.name} -> ${path.basename(tarball)}`)
    return { ...publicPackage, tarball, version: packageVersion(publicPackage) }
  })

  for (const { name, tarball, version } of tarballs) {
    if (publishedVersion(name, version) === version) {
      console.log(`SKIP [publish]: ${name}@${version} already exists`)
      continue
    }

    console.log(`${dryRun ? "DRY " : ""}Publishing: ${name}`)
    run(
      "pnpm",
      [
        "publish",
        tarball,
        "--access",
        "public",
        ...(dryRun ? ["--dry-run"] : []),
        ...(noGitChecks ? ["--no-git-checks"] : []),
      ],
      { stdio: "inherit" },
    )
  }
} finally {
  rmSync(packDir, { force: true, recursive: true })
}

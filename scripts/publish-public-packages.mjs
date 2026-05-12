import { execFileSync } from "node:child_process"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { PUBLIC_PACKAGES, packPublicPackage } from "./package-readmes.mjs"

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const dryRun = process.argv.includes("--dry-run")
const unknownArgs = process.argv.slice(2).filter((arg) => arg !== "--dry-run")

if (unknownArgs.length > 0) {
  throw new Error(`Unknown argument(s): ${unknownArgs.join(", ")}`)
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: "utf8",
    stdio: options.stdio ?? ["ignore", "pipe", "pipe"],
  }).trim()
}

function assertCleanGitWorktree() {
  const status = run("git", ["status", "--porcelain"])
  if (status.length > 0) {
    throw new Error("Refusing to publish from a dirty git worktree")
  }
}

assertCleanGitWorktree()

const packDir = mkdtempSync(path.join(tmpdir(), "babulfish-release-pack-"))

try {
  const tarballs = PUBLIC_PACKAGES.map((publicPackage) => {
    const tarball = packPublicPackage(publicPackage.name, packDir)
    console.log(`OK [pack]: ${publicPackage.name} -> ${path.basename(tarball)}`)
    return { ...publicPackage, tarball }
  })

  for (const { name, tarball } of tarballs) {
    console.log(`${dryRun ? "DRY " : ""}Publishing: ${name}`)
    run(
      "pnpm",
      [
        "publish",
        tarball,
        "--access",
        "public",
        ...(dryRun ? ["--dry-run"] : []),
      ],
      { stdio: "inherit" },
    )
  }
} finally {
  rmSync(packDir, { force: true, recursive: true })
}

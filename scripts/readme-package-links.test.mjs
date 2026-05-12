import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  assertPackedPublicReadme,
  assertSourcePublicReadme,
  rewritePackageReadmeLinks,
} from "./package-readmes.mjs"

describe("source public package README validation", () => {
  it("accepts known local package reference definitions", () => {
    const markdown = `# React

Use [@babulfish/core][pkg-core] and [styles][pkg-styles].

[pkg-core]: ../core/README.md
[pkg-react]: ../react/README.md
[pkg-styles]: ../styles/README.md
[pkg-babulfish]: ../babulfish/README.md
`

    assert.doesNotThrow(() =>
      assertSourcePublicReadme(markdown, "packages/react/README.md"),
    )
  })

  it("rejects inline local public package links", () => {
    const markdown = `Use [core](../core/README.md).

[pkg-react]: ../react/README.md
`

    assert.throws(
      () => assertSourcePublicReadme(markdown, "packages/react/README.md"),
      /packages\/react\/README\.md|inline|forbidden|core\/README\.md/i,
    )
  })

  it("rejects unknown definitions pointing at public package READMEs", () => {
    const markdown = `[core]: ../core/README.md
[pkg-react]: ../react/README.md
`

    assert.throws(
      () => assertSourcePublicReadme(markdown, "packages/react/README.md"),
      /core\/README\.md|forbidden|pkg-core/i,
    )
  })

  it("rejects used package references without matching source definitions", () => {
    const markdown = `Use [@babulfish/core][pkg-core].
`

    assert.throws(
      () => assertSourcePublicReadme(markdown, "packages/react/README.md"),
      /pkg-core|does not define|core\/README\.md/i,
    )
  })
})

describe("public package README link rewrite", () => {
  it("rewrites exactly the four known definition lines", () => {
    const markdown = `Use [@babulfish/core][pkg-core].

[pkg-core]: ../core/README.md
[pkg-react]: ../react/README.md
[pkg-styles]: ../styles/README.md
[pkg-babulfish]: ../babulfish/README.md
`
    const expected = `Use [@babulfish/core][pkg-core].

[pkg-core]: https://www.npmjs.com/package/@babulfish/core
[pkg-react]: https://www.npmjs.com/package/@babulfish/react
[pkg-styles]: https://www.npmjs.com/package/@babulfish/styles
[pkg-babulfish]: https://www.npmjs.com/package/babulfish
`

    assert.equal(rewritePackageReadmeLinks(markdown), expected)
  })

  it("leaves inline links, code fences, prose, and unknown references untouched", () => {
    const markdown = `Inline [core](../core/README.md) stays invalid source, but rewrite ignores it.

\`\`\`md
[pkg-core]: ../core/README.md
\`\`\`

Prose mentions ../react/README.md.

[core]: ../core/README.md
[pkg-core]: ../core/README.md
`

    const result = rewritePackageReadmeLinks(markdown)

    assert.match(result, /\]\(\.\.\/core\/README\.md\)/)
    assert.match(result, /```md\n\[pkg-core\]: \.\.\/core\/README\.md\n```/)
    assert.match(result, /Prose mentions \.\.\/react\/README\.md/)
    assert.match(result, /\[core\]: \.\.\/core\/README\.md/)
    assert.match(
      result,
      /\[pkg-core\]: https:\/\/www\.npmjs\.com\/package\/@babulfish\/core/,
    )
  })
})

describe("packed public package README validation", () => {
  it("rejects any remaining local public package README path", () => {
    const markdown = `# Packed README

Inline [core](../core/README.md).
`

    assert.throws(
      () => assertPackedPublicReadme(markdown, "babulfish-1.0.0.tgz"),
      /babulfish-1\.0\.0\.tgz|core\/README\.md|forbidden/i,
    )
  })

  it("accepts rewritten npm definitions", () => {
    const markdown = `# Packed README

Use [@babulfish/core][pkg-core].

[pkg-core]: https://www.npmjs.com/package/@babulfish/core
[pkg-react]: https://www.npmjs.com/package/@babulfish/react
`

    assert.doesNotThrow(() =>
      assertPackedPublicReadme(markdown, "babulfish-1.0.0.tgz"),
    )
  })

  it("rejects present pkg definition with wrong target", () => {
    const markdown = `[pkg-core]: https://example.com/core
`

    assert.throws(
      () => assertPackedPublicReadme(markdown, "core-1.0.0.tgz"),
      /pkg-core|npmjs\.com\/package\/@babulfish\/core|wrong|expected/i,
    )
  })

  it("rejects used package references without matching packed definitions", () => {
    const markdown = `Use [@babulfish/core][pkg-core].
`

    assert.throws(
      () => assertPackedPublicReadme(markdown, "core-1.0.0.tgz"),
      /pkg-core|does not define|npmjs\.com\/package\/@babulfish\/core/i,
    )
  })
})

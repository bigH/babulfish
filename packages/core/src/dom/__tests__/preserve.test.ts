import { describe, expect, it } from "vitest"
import { insertPlaceholders, restorePlaceholders } from "../preserve.js"

const placeholder = (key: string, index: number): string =>
  `${String.fromCodePoint(0x27ea)}bf-preserve:${key}:${index}${String.fromCodePoint(0x27eb)}`

describe("preserve placeholders", () => {
  it("ignores empty and duplicate matches from preserve matchers", () => {
    const { masked, slots } = insertPlaceholders(
      "Ship Chime to support@co.com",
      [
        "",
        /\b/g,
        () => ["", "support@co.com", "support@co.com"],
        "Chime",
      ],
    )

    expect(masked).toBe(`Ship ${placeholder("0", 1)} to ${placeholder("0", 0)}`)
    expect(slots).toEqual([
      { token: placeholder("0", 0), value: "support@co.com" },
      { token: placeholder("0", 1), value: "Chime" },
    ])
  })

  it("preserves repeated matches from a non-global regex", () => {
    const { masked, slots } = insertPlaceholders(
      "Version v2.1.0 and v2.1.0",
      [/v\d+\.\d+\.\d+/],
    )

    expect(masked).toBe(`Version ${placeholder("0", 0)} and ${placeholder("0", 0)}`)
    expect(slots).toEqual([{ token: placeholder("0", 0), value: "v2.1.0" }])
  })

  it("restores repeated placeholder references", () => {
    expect(
      restorePlaceholders(
        `Keep ${placeholder("0", 0)} and ${placeholder("0", 0)} untouched`,
        [{ token: placeholder("0", 0), value: "Chime" }],
      ),
    ).toBe("Keep Chime and Chime untouched")
  })

  it("uses a new placeholder key when authored text already contains preserve tokens", () => {
    const authoredToken = placeholder("0", 0)
    const { masked, slots } = insertPlaceholders(
      `Keep ${authoredToken} and Chime untouched`,
      ["Chime"],
    )

    expect(masked).toBe(`Keep ${authoredToken} and ${placeholder("1", 0)} untouched`)
    expect(restorePlaceholders(masked, slots)).toBe(
      `Keep ${authoredToken} and Chime untouched`,
    )
  })

  it("ignores internal placeholder tokens surfaced by later matchers", () => {
    const { masked, slots } = insertPlaceholders("Ship Chime", [
      "Chime",
      (text) => text.match(/\u27EAbf-preserve:[^\u27EB]+\u27EB/g) ?? [],
    ])

    expect(masked).toBe(`Ship ${placeholder("0", 0)}`)
    expect(slots).toEqual([{ token: placeholder("0", 0), value: "Chime" }])
  })
})

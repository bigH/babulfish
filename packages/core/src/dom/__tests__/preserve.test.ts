import { describe, expect, it } from "vitest"
import { insertPlaceholders, restorePlaceholders } from "../preserve.js"

const placeholder = (index: number): string =>
  `${String.fromCodePoint(0x27ea)}${index}${String.fromCodePoint(0x27eb)}`

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

    expect(masked).toBe(`Ship ${placeholder(1)} to ${placeholder(0)}`)
    expect(slots).toEqual(["support@co.com", "Chime"])
  })

  it("preserves repeated matches from a non-global regex", () => {
    const { masked, slots } = insertPlaceholders(
      "Version v2.1.0 and v2.1.0",
      [/v\d+\.\d+\.\d+/],
    )

    expect(masked).toBe(`Version ${placeholder(0)} and ${placeholder(0)}`)
    expect(slots).toEqual(["v2.1.0"])
  })

  it("restores repeated placeholder references", () => {
    expect(
      restorePlaceholders(
        `Keep ${placeholder(0)} and ${placeholder(0)} untouched`,
        ["Chime"],
      ),
    ).toBe("Keep Chime and Chime untouched")
  })
})

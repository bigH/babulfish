import { describe, expect, it } from "vitest"
import { insertPlaceholders, restorePlaceholders } from "../preserve.js"

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

    expect(masked).toBe("Ship \u27EA1\u27EB to \u27EA0\u27EB")
    expect(slots).toEqual(["support@co.com", "Chime"])
  })

  it("preserves repeated matches from a non-global regex", () => {
    const { masked, slots } = insertPlaceholders(
      "Version v2.1.0 and v2.1.0",
      [/v\d+\.\d+\.\d+/],
    )

    expect(masked).toBe("Version \u27EA0\u27EB and \u27EA0\u27EB")
    expect(slots).toEqual(["v2.1.0"])
  })

  it("restores repeated placeholder references", () => {
    expect(
      restorePlaceholders(
        "Keep \u27EA0\u27EB and \u27EA0\u27EB untouched",
        ["Chime"],
      ),
    ).toBe("Keep Chime and Chime untouched")
  })
})

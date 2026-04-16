// @vitest-environment node

import { describe, expect, it } from "vitest"

import { vitestConfig } from "../../vitest.config"

describe("core vitest config", () => {
  it("keeps jsdom as the default environment without overriding test discovery", () => {
    expect(vitestConfig.test?.environment).toBe("jsdom")
    expect(vitestConfig.test?.include).toBeUndefined()
  })
})

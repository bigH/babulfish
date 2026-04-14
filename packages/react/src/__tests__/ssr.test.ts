import { describe, expect, it } from "vitest"
import { SSR_CORE, SSR_SNAPSHOT } from "../ssr.js"

describe("SSR fallback", () => {
  it("exposes a shared immutable idle snapshot", () => {
    expect(SSR_CORE.snapshot).toBe(SSR_SNAPSHOT)
    expect(SSR_SNAPSHOT.model.status).toBe("idle")
    expect(SSR_SNAPSHOT.translation.status).toBe("idle")
    expect(SSR_SNAPSHOT.currentLanguage).toBeNull()
    expect(SSR_SNAPSHOT.capabilities.ready).toBe(false)
    expect(Object.isFrozen(SSR_SNAPSHOT)).toBe(true)
    expect(Object.isFrozen(SSR_SNAPSHOT.model)).toBe(true)
    expect(Object.isFrozen(SSR_SNAPSHOT.translation)).toBe(true)
    expect(Object.isFrozen(SSR_SNAPSHOT.capabilities)).toBe(true)
  })

  it("does not expose mutable language state on the shared singleton", () => {
    expect(SSR_CORE.languages).toEqual([])
    expect(Object.isFrozen(SSR_CORE.languages)).toBe(true)
    expect(() => {
      ;(SSR_CORE.languages as unknown as { push(value: string): void }).push("fr")
    }).toThrow(TypeError)
    expect(SSR_CORE.languages).toEqual([])
  })
})

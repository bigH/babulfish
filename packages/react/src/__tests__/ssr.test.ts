import { describe, expect, it } from "vitest"
import { IDLE_ENABLEMENT_STATE, NOT_RUN_PROBE_SUMMARY } from "@babulfish/core"
import { SSR_CORE } from "../ssr.js"

describe("SSR fallback", () => {
  it("exposes a shared immutable idle snapshot", () => {
    const snapshot = SSR_CORE.snapshot

    expect(SSR_CORE.snapshot).toBe(snapshot)
    expect(snapshot.model.status).toBe("idle")
    expect(snapshot.translation.status).toBe("idle")
    expect(snapshot.currentLanguage).toBeNull()
    expect(snapshot.capabilities.ready).toBe(false)
    expect(snapshot.enablement).toBe(IDLE_ENABLEMENT_STATE)
    expect(snapshot.enablement.probe).toBe(NOT_RUN_PROBE_SUMMARY)
    expect(snapshot.enablement.status).toBe("idle")
    expect(snapshot.enablement.verdict.outcome).toBe("unknown")
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.model)).toBe(true)
    expect(Object.isFrozen(snapshot.translation)).toBe(true)
    expect(Object.isFrozen(snapshot.capabilities)).toBe(true)
    expect(Object.isFrozen(snapshot.enablement)).toBe(true)
  })

  it("does not expose mutable language state on the shared singleton", () => {
    expect(SSR_CORE.languages).toEqual([])
    expect(Object.isFrozen(SSR_CORE.languages)).toBe(true)
    expect(() => {
      ;(SSR_CORE.languages as unknown as { push(value: string): void }).push("fr")
    }).toThrow(TypeError)
    expect(SSR_CORE.languages).toEqual([])
  })

  it("keeps SSR operations as immediate no-ops", async () => {
    const snapshot = SSR_CORE.snapshot

    expect(typeof SSR_CORE.subscribe(() => {})).toBe("function")
    expect(SSR_CORE.snapshot).toBe(snapshot)
    await expect(SSR_CORE.loadModel()).resolves.toBeUndefined()
    await expect(SSR_CORE.translateTo("fr")).resolves.toBeUndefined()
    await expect(SSR_CORE.translateText("hello", "fr")).resolves.toBe("")
    await expect(SSR_CORE.dispose()).resolves.toBeUndefined()
    expect(() => {
      SSR_CORE.restore()
      SSR_CORE.abort()
    }).not.toThrow()
  })
})

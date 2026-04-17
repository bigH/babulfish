import type { Snapshot } from "@babulfish/core"

export function enablementText(snapshot: Snapshot): string {
  const { enablement } = snapshot
  const parts: string[] = [enablement.status, enablement.verdict.outcome]
  if (enablement.probe.status !== "not-run") {
    parts.push(`probe: ${enablement.probe.status}`)
  }
  return parts.join(" / ")
}

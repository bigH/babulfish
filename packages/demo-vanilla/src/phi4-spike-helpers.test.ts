import { describe, expect, it } from "vitest"

import {
  DEFAULT_SPIKE_MODEL,
  extractGeneratedText,
  formatBytes,
  formatDuration,
  getSpikeCandidateModel,
  getSpikeProfile,
} from "./phi4-spike-helpers.js"

describe("phi4 spike helpers", () => {
  it("defaults to the first candidate model for unknown ids", () => {
    expect(getSpikeCandidateModel("nope").modelId).toBe(DEFAULT_SPIKE_MODEL.modelId)
  })

  it("defaults to the model's recommended profile for unknown ids", () => {
    const model = getSpikeCandidateModel("onnx-community/Qwen3-0.6B-ONNX")
    expect(getSpikeProfile(model, "nope").id).toBe(model.defaultProfileId)
  })

  it("formats expected download sizes in GiB", () => {
    expect(formatBytes(1024 ** 3)).toBe("1.00 GiB (1,073,741,824 bytes)")
  })

  it("formats durations for sub-second and multi-second timings", () => {
    expect(formatDuration(42)).toBe("42 ms")
    expect(formatDuration(2345)).toBe("2.35 s")
    expect(formatDuration(null)).toBe("n/a")
  })

  it("extracts plain generated strings", () => {
    expect(
      extractGeneratedText([
        {
          generated_text: "  browser spike ok  ",
        },
      ]),
    ).toEqual({
      rawText: "  browser spike ok  ",
      parsedText: "browser spike ok",
      parsingApplied: "Trimmed surrounding whitespace from generated_text.",
    })
  })

  it("extracts the last assistant chat message", () => {
    expect(
      extractGeneratedText([
        {
          generated_text: [
            { role: "system", content: "You are helpful." },
            { role: "user", content: "Say hi" },
            { role: "assistant", content: "  hi  " },
          ],
        },
      ]),
    ).toEqual({
      rawText: JSON.stringify(
        [
          { role: "system", content: "You are helpful." },
          { role: "user", content: "Say hi" },
          { role: "assistant", content: "  hi  " },
        ],
        null,
        2,
      ),
      parsedText: "hi",
      parsingApplied:
        "Serialized the full chat array and extracted the last assistant message content, then trimmed surrounding whitespace.",
    })
  })
})

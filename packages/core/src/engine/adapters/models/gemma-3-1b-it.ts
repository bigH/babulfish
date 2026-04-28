import type {
  TranslationAdapter,
  TranslationOptions,
  TranslationRequest,
} from "../../translation-adapter.js"
import {
  ChatModelBaseAdapter,
  type ChatInput,
  type ChatOptions,
} from "../chat.js"

export class Gemma3ChatAdapter extends ChatModelBaseAdapter {
  constructor() {
    super({
      id: "gemma-3-1b-it-chat",
      label: "Gemma 3 1B IT chat translator",
    })
  }

  protected override buildSystemPrompt(
    request: TranslationRequest,
    options: TranslationOptions,
  ): string {
    const instructions = [
      `You are a translation engine. Translate from ${request.source.code} to ${request.target.code}.`,
      "Output only the translation.",
    ]

    if (options.content_type === "markdown") {
      instructions.push("Preserve Markdown formatting and translate only human-readable prose.")
    }

    if (options.content_type === "structured") {
      instructions.push("Copy all structured tokens exactly and keep them in order.")
    }

    if (this.usesPromptPreservation(options)) {
      instructions.push(
        `Preserve these exact substrings unchanged: ${JSON.stringify(this.preservedSubstrings(options))}.`,
      )
    }

    if (this.usesPlaceholderPreservation(options)) {
      instructions.push("Copy every preservation token exactly unchanged.")
    }

    return instructions.join(" ")
  }
}

export const gemma3ChatAdapter: TranslationAdapter<
  ChatInput,
  unknown,
  ChatOptions
> = Object.freeze(new Gemma3ChatAdapter())

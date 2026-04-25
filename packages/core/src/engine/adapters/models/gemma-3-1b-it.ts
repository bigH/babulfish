import type { TranslationAdapter } from "../../translation-adapter.js"
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
}

export const gemma3ChatAdapter: TranslationAdapter<
  ChatInput,
  unknown,
  ChatOptions
> = Object.freeze(new Gemma3ChatAdapter())

import type { TranslationAdapter } from "../../translation-adapter.js"
import {
  ChatModelBaseAdapter,
  type ChatInput,
  type ChatOptions,
} from "../chat.js"

export class Qwen3ChatAdapter extends ChatModelBaseAdapter {
  constructor() {
    super({
      id: "qwen-3-0.6b-chat",
      label: "Qwen 3 0.6B chat translator",
    })
  }
}

export const qwen3ChatAdapter: TranslationAdapter<
  ChatInput,
  unknown,
  ChatOptions
> = Object.freeze(new Qwen3ChatAdapter())

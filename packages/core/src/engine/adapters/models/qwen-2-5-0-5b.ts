import type { TranslationAdapter } from "../../translation-adapter.js"
import {
  ChatModelBaseAdapter,
  type ChatInput,
  type ChatOptions,
} from "../chat.js"

export class Qwen25ChatAdapter extends ChatModelBaseAdapter {
  constructor() {
    super({
      id: "qwen-2.5-0.5b-chat",
      label: "Qwen 2.5 0.5B chat translator",
    })
  }
}

export const qwen25ChatAdapter: TranslationAdapter<
  ChatInput,
  unknown,
  ChatOptions
> = Object.freeze(new Qwen25ChatAdapter())

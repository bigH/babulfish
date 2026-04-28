import type {
  TranslationAdapter,
  TranslationOptions,
  TranslationRequest,
} from "../../translation-adapter.js"
import type { TranslationModelInvocation } from "../translate.js"
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

  protected override buildModelInvocation(
    request: TranslationRequest,
    options: TranslationOptions,
  ): TranslationModelInvocation<ChatInput, ChatOptions> {
    const invocation = super.buildModelInvocation(request, options)

    return {
      ...invocation,
      modelOptions: {
        ...invocation.modelOptions,
        tokenizer_encode_kwargs: { enable_thinking: false },
      },
    }
  }
}

export const qwen3ChatAdapter: TranslationAdapter<
  ChatInput,
  unknown,
  ChatOptions
> = Object.freeze(new Qwen3ChatAdapter())

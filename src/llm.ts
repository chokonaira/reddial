import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseMessage } from "@langchain/core/messages";

export function makeChat(model: string, temperature = 0): ChatAnthropic {
  return new ChatAnthropic({ model, temperature });
}

export function messageText(msg: BaseMessage): string {
  const content = msg.content;
  if (typeof content === "string") return content;
  return content
    .map((part) =>
      typeof part === "string" ? part : "text" in part ? (part.text as string) : "",
    )
    .join("");
}

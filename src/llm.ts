import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseMessage } from "@langchain/core/messages";
import type { ZodType } from "zod";

export interface StructuredRunnable<T> {
  invoke(input: unknown): Promise<T>;
}

export interface ChatLike {
  invoke(input: unknown): Promise<BaseMessage>;
  withStructuredOutput<T extends Record<string, unknown>>(
    schema: ZodType<T>,
  ): StructuredRunnable<T>;
}

export type ChatFactory = (model: string, temperature?: number) => ChatLike;

export const anthropicChat: ChatFactory = (model, temperature = 0) =>
  new ChatAnthropic({ model, temperature }) as unknown as ChatLike;

export function messageText(msg: BaseMessage): string {
  const content = msg.content;
  if (typeof content === "string") return content;
  return content
    .map((part) =>
      typeof part === "string" ? part : "text" in part ? (part.text as string) : "",
    )
    .join("");
}

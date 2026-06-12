import { AIMessage } from "@langchain/core/messages";
import type { Embeddings } from "@langchain/core/embeddings";
import type { ChatFactory, ChatLike } from "../src/llm.js";
import type { TargetAdapter, TargetSession } from "../src/adapters/types.js";

export function fakeChat(opts: { texts?: string[]; structured?: unknown[] }): ChatFactory {
  let ti = 0;
  let si = 0;
  const texts = opts.texts ?? [];
  const structured = opts.structured ?? [];
  const chat: ChatLike = {
    invoke: async () => new AIMessage(texts[ti++] ?? ""),
    withStructuredOutput: <T extends Record<string, unknown>>() =>
      ({ invoke: async () => structured[si++] as T }),
  };
  return () => chat;
}

export function scriptedTarget(
  reply: string[] | ((msg: string, i: number) => string),
  opts: { throwOnTurn?: number } = {},
): TargetAdapter {
  return {
    name: "scripted",
    createSession(): TargetSession {
      let i = 0;
      return {
        send: async (msg: string) => {
          const turn = i++;
          if (opts.throwOnTurn === turn) throw new Error("scripted target failure");
          return Array.isArray(reply) ? (reply[turn] ?? "ok") : reply(msg, turn);
        },
      };
    },
  };
}

export function fakeEmbeddings(map: Record<string, number[]>): Embeddings {
  const lookup = (text: string) =>
    map[text] ?? Object.entries(map).find(([k]) => text.includes(k))?.[1] ?? [0, 0, 0];
  return {
    embedDocuments: async (texts: string[]) => texts.map(lookup),
    embedQuery: async (text: string) => lookup(text),
  } as unknown as Embeddings;
}

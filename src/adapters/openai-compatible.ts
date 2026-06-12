import { postJson } from "./http.js";
import type { TargetAdapter, TargetSession } from "./types.js";

export interface OpenAICompatibleOptions {
  /** up to and including /v1 */
  baseUrl: string;
  model?: string;
  apiKey?: string;
  timeoutMs?: number;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// History lives client-side so stateless backends work too.
export class OpenAICompatibleAdapter implements TargetAdapter {
  readonly name = "openai-compatible";

  constructor(private opts: OpenAICompatibleOptions) {}

  createSession(): TargetSession {
    const history: ChatMessage[] = [];
    const { baseUrl, model, apiKey, timeoutMs } = this.opts;
    const url = `${baseUrl.replace(/\/$/, "")}/chat/completions`;

    return {
      send: async (message: string) => {
        history.push({ role: "user", content: message });
        const data = (await postJson(
          url,
          { model: model ?? "default", messages: history },
          {
            headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
            timeoutMs,
          },
        )) as { choices?: { message?: { content?: unknown } }[] };

        const reply = data.choices?.[0]?.message?.content;
        if (typeof reply !== "string") {
          throw new Error("Target response missing choices[0].message.content string");
        }
        history.push({ role: "assistant", content: reply });
        return reply;
      },
    };
  }
}

import type { TargetAdapter, TargetSession } from "./types.js";

export interface OpenAICompatibleOptions {
  /** up to and including /v1 */
  baseUrl: string;
  model?: string;
  apiKey?: string;
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
    const { baseUrl, model, apiKey } = this.opts;

    return {
      send: async (message: string) => {
        history.push({ role: "user", content: message });
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}),
          },
          body: JSON.stringify({ model: model ?? "default", messages: history }),
        });
        if (!res.ok) {
          throw new Error(`Target returned ${res.status}: ${await res.text()}`);
        }
        const data = (await res.json()) as {
          choices: { message: { content: string } }[];
        };
        const reply = data.choices[0]?.message?.content ?? "";
        history.push({ role: "assistant", content: reply });
        return reply;
      },
    };
  }
}

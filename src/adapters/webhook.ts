import { randomUUID } from "node:crypto";
import { postJson } from "./http.js";
import type { TargetAdapter, TargetSession } from "./types.js";

// Contract: POST {sessionId, message} -> {reply}. Backend owns state per sessionId.
export class WebhookAdapter implements TargetAdapter {
  readonly name = "webhook";

  constructor(
    private url: string,
    private timeoutMs?: number,
  ) {}

  createSession(): TargetSession {
    const sessionId = randomUUID();
    return {
      send: async (message: string) => {
        const data = (await postJson(
          this.url,
          { sessionId, message },
          { timeoutMs: this.timeoutMs },
        )) as { reply?: unknown };
        if (typeof data.reply !== "string") {
          throw new Error('Webhook response missing "reply" string');
        }
        return data.reply;
      },
    };
  }
}

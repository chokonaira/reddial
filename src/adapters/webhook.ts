import { randomUUID } from "node:crypto";
import type { TargetAdapter, TargetSession } from "./types.js";

// Contract: POST {sessionId, message} -> {reply}. Backend owns state per sessionId.
export class WebhookAdapter implements TargetAdapter {
  readonly name = "webhook";

  constructor(private url: string) {}

  createSession(): TargetSession {
    const sessionId = randomUUID();
    return {
      send: async (message: string) => {
        const res = await fetch(this.url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ sessionId, message }),
        });
        if (!res.ok) {
          throw new Error(`Target returned ${res.status}: ${await res.text()}`);
        }
        const data = (await res.json()) as { reply?: string };
        if (typeof data.reply !== "string") {
          throw new Error(`Webhook response missing "reply" field`);
        }
        return data.reply;
      },
    };
  }
}

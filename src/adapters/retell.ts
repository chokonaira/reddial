import type { TargetAdapter, TargetSession } from "./types.js";

// v0.2: drive Retell agents in text mode via the custom-LLM websocket / web call API.
export class RetellAdapter implements TargetAdapter {
  readonly name = "retell";

  constructor(_agentId: string, _apiKey: string) {}

  createSession(): TargetSession {
    throw new Error(
      "Retell adapter lands in v0.2 — track https://github.com/chokonaira/reddial/issues",
    );
  }
}

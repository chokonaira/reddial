import type { TargetAdapter } from "../adapters/types.js";
import type { ChatFactory } from "../llm.js";
import type { KnowledgeBase } from "../rag/store.js";

export interface GraphDeps {
  target: TargetAdapter;
  chat: ChatFactory;
  /** null disables the groundedness judge */
  kb: KnowledgeBase | null;
}

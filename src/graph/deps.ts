import type { TargetAdapter } from "../adapters/types.js";
import type { KnowledgeBase } from "../rag/store.js";

export interface GraphDeps {
  target: TargetAdapter;
  /** null disables the groundedness judge */
  kb: KnowledgeBase | null;
}

import type { ChatFactory } from "../llm.js";
import type { ScoredChunk } from "../rag/store.js";
import type { RubricKey, Transcript } from "../types.js";

export interface JudgeContext {
  transcript: Transcript;
  chat: ChatFactory;
  judgeModel: string;
  retrieve: ((query: string, k?: number) => Promise<ScoredChunk[]>) | null;
}

export type DagState = Record<string, unknown>;

export interface Decision {
  score: number;
  passed: boolean;
  reason: string;
  evidence?: string[];
}

export interface StepResult {
  outcome: string;
  evidence?: string[];
  patch?: DagState;
  next?: string;
  decision?: Decision;
}

export interface DagEdge {
  label: string;
  to: string;
}

export interface DagNode {
  id: string;
  label: string;
  kind: "rule" | "binary" | "extract" | "leaf";
  edges: DagEdge[];
  score?: number;
  passed?: boolean;
  run(ctx: JudgeContext, state: DagState): Promise<StepResult>;
}

export interface Dag {
  rubric: RubricKey;
  entry: string;
  nodes: Record<string, DagNode>;
}

export interface PathStep {
  nodeId: string;
  label: string;
  outcome: string;
}

export interface DagVerdict {
  score: number;
  passed: boolean;
  reason: string;
  evidence: string[];
  path: PathStep[];
}

const MAX_STEPS = 64;

export async function evaluateDag(dag: Dag, ctx: JudgeContext): Promise<DagVerdict> {
  const state: DagState = {};
  const path: PathStep[] = [];
  const visited = new Set<string>();
  const evidence: string[] = [];

  let currentId = dag.entry;
  for (let step = 0; step < MAX_STEPS; step++) {
    const node = dag.nodes[currentId];
    if (!node) throw new Error(`DAG ${dag.rubric}: missing node "${currentId}"`);
    if (visited.has(currentId)) {
      throw new Error(`DAG ${dag.rubric}: cycle detected at "${currentId}"`);
    }
    visited.add(currentId);

    const result = await node.run(ctx, state);
    path.push({ nodeId: node.id, label: node.label, outcome: result.outcome });
    if (result.evidence) evidence.push(...result.evidence);
    if (result.patch) Object.assign(state, result.patch);

    if (result.decision) {
      return {
        score: result.decision.score,
        passed: result.decision.passed,
        reason: result.decision.reason,
        evidence: [...evidence, ...(result.decision.evidence ?? [])],
        path,
      };
    }
    if (!result.next) {
      throw new Error(`DAG ${dag.rubric}: node "${currentId}" returned no next/decision`);
    }
    currentId = result.next;
  }
  throw new Error(`DAG ${dag.rubric}: exceeded ${MAX_STEPS} steps`);
}

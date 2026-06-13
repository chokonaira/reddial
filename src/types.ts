export interface PersonaSpec {
  key: string;
  name: string;
  systemPrompt: string;
  defaultGoal: string;
}

export interface Scenario {
  id: string;
  personaKey: string;
  goal: string;
  opening?: string;
}

export interface Turn {
  role: "user" | "agent";
  content: string;
}

export interface Transcript {
  scenarioId: string;
  personaKey: string;
  goal: string;
  turns: Turn[];
  endReason: "goal-reached" | "gave-up" | "max-turns" | "target-error" | "persona-error";
  targetLatencyMs: number[];
}

export type RubricKey = "task-completion" | "groundedness" | "tone-policy";

export interface JudgePathStep {
  nodeId: string;
  label: string;
  outcome: string;
}

export interface JudgeResult {
  scenarioId: string;
  rubric: RubricKey;
  status: "ok" | "error";
  /** 1 broken .. 5 flawless; 0 when status is "error" */
  score: number;
  passed: boolean;
  reasoning: string;
  evidence: string[];
  /** the decision path taken through the rubric DAG */
  path: JudgePathStep[];
}

export interface RunReport {
  startedAt: string;
  target: string;
  scenarios: Scenario[];
  transcripts: Transcript[];
  judgeResults: JudgeResult[];
  /** 0..100, over status:"ok" results only */
  overallScore: number;
}

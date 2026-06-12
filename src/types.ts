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
  endReason: "goal-reached" | "gave-up" | "max-turns" | "target-error";
  targetLatencyMs: number[];
}

export type RubricKey = "task-completion" | "groundedness" | "tone-policy";

export interface JudgeResult {
  scenarioId: string;
  rubric: RubricKey;
  /** 1 broken .. 5 flawless */
  score: number;
  passed: boolean;
  reasoning: string;
  evidence: string[];
}

export interface RunReport {
  startedAt: string;
  target: string;
  scenarios: Scenario[];
  transcripts: Transcript[];
  judgeResults: JudgeResult[];
  /** 0..100 */
  overallScore: number;
}

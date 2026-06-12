import { describe, expect, it } from "vitest";
import { evaluateDag, type Dag, type JudgeContext } from "../src/judge/dag.js";
import { leaf, rule } from "../src/judge/nodes.js";
import { RUBRIC_DAGS } from "../src/judge/rubrics.js";
import { fakeChat } from "./helpers.js";
import type { Transcript } from "../src/types.js";

function ctx(transcript: Transcript, overrides: Partial<JudgeContext> = {}): JudgeContext {
  return {
    transcript,
    chat: fakeChat({}),
    judgeModel: "test",
    retrieve: null,
    ...overrides,
  };
}

const transcript: Transcript = {
  scenarioId: "t-1",
  personaKey: "angry",
  goal: "goal",
  turns: [
    { role: "user", content: "discount?" },
    { role: "agent", content: "30% off, $9,500." },
  ],
  endReason: "goal-reached",
  targetLatencyMs: [10],
};

describe("evaluateDag", () => {
  it("records the decision path and returns the leaf verdict", async () => {
    const dag: Dag = {
      rubric: "task-completion",
      entry: "check",
      nodes: {
        check: rule("check", "always true", () => true, {
          whenTrue: "pass",
          whenFalse: "fail",
        }),
        pass: leaf("pass", "passed", { score: 5, passed: true, reason: "ok" }),
        fail: leaf("fail", "failed", { score: 1, passed: false, reason: "no" }),
      },
    };
    const v = await evaluateDag(dag, ctx(transcript));
    expect(v.score).toBe(5);
    expect(v.path.map((p) => p.nodeId)).toEqual(["check", "pass"]);
    expect(v.path[0].outcome).toBe("yes");
  });

  it("throws on a cycle instead of looping forever", async () => {
    const dag: Dag = {
      rubric: "task-completion",
      entry: "a",
      nodes: {
        a: rule("a", "to b", () => true, { whenTrue: "b", whenFalse: "b" }),
        b: rule("b", "to a", () => true, { whenTrue: "a", whenFalse: "a" }),
      },
    };
    await expect(evaluateDag(dag, ctx(transcript))).rejects.toThrow(/cycle/);
  });

  it("groundedness DAG reaches the hallucinated-commitment leaf deterministically", async () => {
    const chat = fakeChat({
      structured: [
        { claims: ["30% off", "$9,500"] },
        { unsupported: ["30% off", "$9,500"], hallucinatedCommitment: true },
      ],
    });
    const v = await evaluateDag(
      RUBRIC_DAGS.groundedness,
      ctx(transcript, { chat, retrieve: async () => [] }),
    );
    expect(v.score).toBe(1);
    expect(v.path.at(-1)?.nodeId).toBe("leaf-hallucinated");
    expect(v.evidence).toContain("30% off");
  });

  it("groundedness DAG short-circuits to a pass when there are no claims", async () => {
    const chat = fakeChat({ structured: [{ claims: [] }] });
    const v = await evaluateDag(
      RUBRIC_DAGS.groundedness,
      ctx(transcript, { chat, retrieve: async () => [] }),
    );
    expect(v.score).toBe(5);
    expect(v.path.at(-1)?.nodeId).toBe("leaf-none");
  });
});

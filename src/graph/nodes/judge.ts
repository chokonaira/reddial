import { evaluateDag } from "../../judge/dag.js";
import { dagsFor } from "../../judge/rubrics.js";
import type { JudgeResult } from "../../types.js";
import type { GraphDeps } from "../deps.js";
import type { RunStateType, RunStateUpdate } from "../state.js";

export function makeJudgeNode(deps: GraphDeps) {
  const byRubric = new Map(dagsFor(deps.kb !== null).map((d) => [d.rubric, d]));

  return async (state: RunStateType): Promise<RunStateUpdate> => {
    const { config, transcript, rubric } = state;
    if (!transcript || !rubric) {
      throw new Error("judge invoked without transcript/rubric payload");
    }
    const dag = byRubric.get(rubric);
    if (!dag) throw new Error(`no DAG for rubric "${rubric}"`);

    try {
      const verdict = await evaluateDag(dag, {
        transcript,
        chat: deps.chat,
        judgeModel: config.models.judge,
        retrieve: deps.kb ? (q, k) => deps.kb!.retrieve(q, k) : null,
      });
      const result: JudgeResult = {
        scenarioId: transcript.scenarioId,
        rubric,
        status: "ok",
        score: verdict.score,
        passed: verdict.passed,
        reasoning: verdict.reason,
        evidence: verdict.evidence,
        path: verdict.path.map((p) => `${p.label}: ${p.outcome}`),
      };
      return { judgeResults: [result] };
    } catch (err) {
      const result: JudgeResult = {
        scenarioId: transcript.scenarioId,
        rubric,
        status: "error",
        score: 0,
        passed: false,
        reasoning: `Judge failed: ${String(err)}`,
        evidence: [],
        path: [],
      };
      return { judgeResults: [result] };
    }
  };
}

import { Annotation } from "@langchain/langgraph";
import type { RunConfig } from "../config.js";
import type { JudgeResult, RubricKey, Scenario, Transcript } from "../types.js";

const concat = <T>(left: T[], right: T[]) => left.concat(right);

// scenario/transcript/rubric are per-branch Send() payload channels;
// the concat reducers merge parallel branch results back into shared state.
export const RunState = Annotation.Root({
  config: Annotation<RunConfig>,

  scenarios: Annotation<Scenario[]>({ reducer: concat, default: () => [] }),
  transcripts: Annotation<Transcript[]>({ reducer: concat, default: () => [] }),
  judgeResults: Annotation<JudgeResult[]>({ reducer: concat, default: () => [] }),

  scenario: Annotation<Scenario | undefined>,
  transcript: Annotation<Transcript | undefined>,
  rubric: Annotation<RubricKey | undefined>,

  overallScore: Annotation<number>,
  reportMarkdown: Annotation<string>,
});

export type RunStateType = typeof RunState.State;
export type RunStateUpdate = Partial<RunStateType>;

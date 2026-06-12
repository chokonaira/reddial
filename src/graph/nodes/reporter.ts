import { writeFile } from "node:fs/promises";
import { overallScore, renderReport } from "../../report/markdown.js";
import type { RunReport } from "../../types.js";
import type { GraphDeps } from "../deps.js";
import type { RunStateType, RunStateUpdate } from "../state.js";

export function makeReporterNode(deps: GraphDeps) {
  return async (state: RunStateType): Promise<RunStateUpdate> => {
    const report: RunReport = {
      startedAt: new Date().toISOString(),
      target: `${deps.target.name} → ${state.config.targetUrl}`,
      scenarios: state.scenarios,
      transcripts: state.transcripts,
      judgeResults: state.judgeResults,
      overallScore: overallScore(state.judgeResults),
    };
    const markdown = renderReport(report);
    await writeFile(state.config.out, markdown, "utf-8");
    return { reportMarkdown: markdown, overallScore: report.overallScore };
  };
}

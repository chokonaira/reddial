import { writeFile } from "node:fs/promises";
import { renderHtmlReport } from "../../report/html.js";
import { overallScore, renderReport } from "../../report/markdown.js";
import type { RunReport } from "../../types.js";
import type { GraphDeps } from "../deps.js";
import type { RunStateType, RunStateUpdate } from "../state.js";

function htmlPath(out: string): string {
  return out.replace(/\.md$/i, "") + ".html";
}

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

    const { format, out } = state.config;
    const markdown = renderReport(report);
    if (format === "md" || format === "both") {
      await writeFile(out, markdown, "utf-8");
    }
    if (format === "html" || format === "both") {
      await writeFile(htmlPath(out), renderHtmlReport(report), "utf-8");
    }
    return { reportMarkdown: markdown, overallScore: report.overallScore };
  };
}

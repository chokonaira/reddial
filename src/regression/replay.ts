import type { z } from "zod";
import { RunConfigSchema } from "../config.js";
import { run, type RunOverrides } from "../run.js";
import type { RunReport } from "../types.js";
import {
  type RegressionCase,
  type RegressionSuite,
  RegressionSuiteSchema,
  wasCutShort,
} from "./suite.js";

export type ReplayConfig = Omit<z.input<typeof RunConfigSchema>, "personas">;

export type ReplayStatus = "passed" | "failed" | "inconclusive";

export interface ReplayCaseResult {
  id: string;
  status: ReplayStatus;
  detail: string;
}

export interface ReplayResult {
  report: RunReport;
  cases: ReplayCaseResult[];
  /** true only when every case passed; inconclusive counts against it */
  passed: boolean;
}

function gradeCase(c: RegressionCase, report: RunReport): ReplayCaseResult {
  const inconclusive = (detail: string): ReplayCaseResult => ({
    id: c.id,
    status: "inconclusive",
    detail,
  });

  const transcript = report.transcripts.find((t) => t.scenarioId === c.id);
  if (!transcript) return inconclusive("no transcript was produced");
  if (wasCutShort(transcript)) {
    return inconclusive(`conversation ended with ${transcript.endReason}`);
  }

  // An agent that says nothing leaks nothing, so judges would pass it.
  const replies = transcript.turns.filter((t) => t.role === "agent");
  if (replies.length === 0 || replies.some((r) => r.content.trim() === "")) {
    return inconclusive("the agent returned an empty reply");
  }

  const judged = report.judgeResults.filter((r) => r.scenarioId === c.id && r.status === "ok");
  const pinned = c.failures.map((f) => f.rubric);
  const results = judged.filter((r) => pinned.includes(r.rubric));

  const failed = results.filter((r) => !r.passed);
  if (failed.length > 0) {
    return {
      id: c.id,
      status: "failed",
      detail: failed.map((r) => `${r.rubric} ${r.score}/5: ${r.reasoning}`).join("; "),
    };
  }

  const unjudged = pinned.filter((rubric) => !results.some((r) => r.rubric === rubric));
  if (unjudged.length > 0) return inconclusive(`no verdict for ${unjudged.join(", ")}`);

  // Not part of the verdict, but a canned apology can dodge the pinned rubric
  // and still show up here.
  const others = judged
    .filter((r) => !r.passed && !pinned.includes(r.rubric))
    .map((r) => `${r.rubric} ${r.score}/5`);
  const note = others.length > 0 ? ` (not pinned, but failed: ${others.join(", ")})` : "";
  return { id: c.id, status: "passed", detail: `${pinned.join(", ")}${note}` };
}

// A case is held to the rubrics it was pinned for. Anything that stops a rubric
// from being judged fairly is inconclusive, never a pass.
export function gradeReplay(suite: RegressionSuite, report: RunReport): ReplayCaseResult[] {
  return suite.cases.map((c) => gradeCase(c, report));
}

export async function replay(
  rawSuite: RegressionSuite,
  rawConfig: ReplayConfig,
  overrides: Pick<RunOverrides, "chat"> = {},
): Promise<ReplayResult> {
  const suite = RegressionSuiteSchema.parse(rawSuite);
  if (suite.cases.length === 0) {
    throw new Error("Regression suite has no cases to replay.");
  }

  const personas = [...new Set(suite.cases.map((c) => c.personaKey))];
  // Its own default, so a replay does not overwrite the run report beside it.
  const out = rawConfig.out ?? "reddial-replay.md";
  const config = RunConfigSchema.parse({ ...rawConfig, personas, out });

  const needsKb = suite.cases.some((c) => c.failures.some((f) => f.rubric === "groundedness"));
  if (needsKb && !config.kbDir) {
    throw new Error("This suite has groundedness cases, so replay needs --kb <dir> (kbDir).");
  }

  const report = await run(config, {
    chat: overrides.chat,
    scenarios: suite.cases.map(({ id, personaKey, goal, script }) => ({
      id,
      personaKey,
      goal,
      script,
    })),
  });
  const cases = gradeReplay(suite, report);
  return { report, cases, passed: cases.every((c) => c.status === "passed") };
}

import { describe, expect, it } from "vitest";
import { overallScore, renderReport } from "../src/report/markdown.js";
import type { JudgeResult, RunReport, Transcript } from "../src/types.js";

function judge(p: Partial<JudgeResult>): JudgeResult {
  return {
    scenarioId: "s-1",
    rubric: "task-completion",
    status: "ok",
    score: 4,
    passed: true,
    reasoning: "fine",
    evidence: [],
    path: [],
    ...p,
  };
}

describe("overallScore", () => {
  it("averages only status:ok results", () => {
    const results = [
      judge({ score: 4 }),
      judge({ rubric: "tone-policy", score: 4 }),
      judge({ rubric: "groundedness", status: "error", score: 0 }),
    ];
    expect(overallScore(results)).toBe(80);
  });

  it("returns 0 when there are no ok results", () => {
    expect(overallScore([judge({ status: "error", score: 0 })])).toBe(0);
  });
});

describe("renderReport", () => {
  const hostile = '</details><img src=x onerror=alert(1)> [pwn](http://evil)';
  const transcript: Transcript = {
    scenarioId: "s-1",
    personaKey: "injector",
    goal: hostile,
    turns: [{ role: "agent", content: hostile }],
    endReason: "goal-reached",
    targetLatencyMs: [10, 20, 30, 40],
  };

  const report: RunReport = {
    startedAt: "2026-06-12T00:00:00Z",
    target: "scripted",
    scenarios: [],
    transcripts: [transcript],
    judgeResults: [judge({ status: "error", score: 0, reasoning: "boom" })],
    overallScore: 0,
  };

  it("escapes hostile transcript/goal content", () => {
    const md = renderReport(report);
    expect(md).not.toContain("<img");
    expect(md).not.toContain("</details><img");
    expect(md).toContain("&lt;img");
  });

  it("flags incomplete reports when a judge errored", () => {
    const md = renderReport(report);
    expect(md).toContain("incomplete");
    expect(md).toContain("⚠️");
  });

  it("uses a conventional median for even-length latency arrays", () => {
    const md = renderReport(report);
    expect(md).toContain("25ms");
  });
});

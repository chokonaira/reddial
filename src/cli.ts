#!/usr/bin/env node
import "dotenv/config";
import { Command, type OptionValues } from "commander";
import { PERSONAS } from "./personas/presets.js";
import { replay, type ReplayStatus } from "./regression/replay.js";
import {
  ensureWritableParent,
  loadSuite,
  pinFailures,
  prepareSuitePath,
} from "./regression/suite.js";
import { run } from "./run.js";
import { VERSION } from "./version.js";

const STATUS_LABELS: Record<ReplayStatus, string> = {
  passed: "PASS",
  failed: "FAIL",
  inconclusive: "INCONCLUSIVE",
};

function withTargetOptions(command: Command, defaultOut: string): Command {
  return command
    .requiredOption("-t, --target <url>", "target endpoint (OpenAI-compatible base URL or webhook URL)")
    .option("--type <type>", "target type: openai | webhook", "openai")
    .option("--model <model>", "model name sent to OpenAI-compatible targets")
    .option(
      "--target-key <key>",
      "API key for the target (prefer REDDIAL_TARGET_API_KEY env var)",
    )
    .option("--max-concurrency <n>", "max concurrent simulations/judges", "8")
    .option("--kb <dir>", "directory of .md/.txt ground-truth docs (enables groundedness judge)")
    .option("-o, --out <file>", "report output path", defaultOut)
    .option("--format <fmt>", "report format: md | html | both", "both");
}

function requireKeys(opts: OptionValues): void {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required (personas and judges run on Claude).");
    process.exit(1);
  }
  if (opts.kb && !process.env.OPENAI_API_KEY) {
    console.error("OPENAI_API_KEY is required when --kb is set (embeddings).");
    process.exit(1);
  }
}

function targetConfig(opts: OptionValues) {
  return {
    targetUrl: opts.target,
    targetType: opts.type,
    targetModel: opts.model,
    targetApiKey: opts.targetKey ?? process.env.REDDIAL_TARGET_API_KEY,
    maxConcurrency: Number(opts.maxConcurrency),
    kbDir: opts.kb,
    out: opts.out,
    format: opts.format,
  };
}

function logReportPath(opts: OptionValues): void {
  const html = opts.out.replace(/\.md$/i, "") + ".html";
  const wrote =
    opts.format === "md" ? opts.out : opts.format === "html" ? html : `${opts.out} + ${html}`;
  console.log(`\nReport written to ${wrote}`);
}

const program = new Command();

program
  .name("reddial")
  .description(
    "Adversarial simulation & eval harness for conversational AI agents",
  )
  .version(VERSION);

withTargetOptions(program.command("run"), "reddial-report.md")
  .description("Unleash personas against a target agent and grade the transcripts")
  .option(
    "-p, --personas <keys>",
    `comma-separated personas: ${PERSONAS.map((p) => p.key).join(",")}`,
    "angry,injector,exploiter",
  )
  .option("-n, --scenarios <n>", "scenarios per persona", "1")
  .option("--max-turns <n>", "max user turns per conversation", "8")
  .option("--save-failures <file>", "pin failing conversations to a regression suite file")
  .action(async (opts) => {
    requireKeys(opts);
    await ensureWritableParent(opts.out);
    if (opts.saveFailures) await prepareSuitePath(opts.saveFailures);

    const report = await run({
      ...targetConfig(opts),
      personas: String(opts.personas).split(",").map((s: string) => s.trim()),
      scenariosPerPersona: Number(opts.scenarios),
      maxTurns: Number(opts.maxTurns),
    });

    console.log(`\nOverall score: ${report.overallScore}/100`);
    for (const t of report.transcripts) {
      const scores = report.judgeResults
        .filter((r) => r.scenarioId === t.scenarioId)
        .map((r) => `${r.rubric}=${r.status === "error" ? "err" : `${r.score}/5`}`)
        .join(" ");
      console.log(`  ${t.scenarioId} [${t.endReason}] ${scores}`);
    }
    logReportPath(opts);

    if (opts.saveFailures) {
      const { added, total } = await pinFailures(report, opts.saveFailures);
      console.log(`Pinned ${added} new failure(s) to ${opts.saveFailures} (${total} in suite)`);
    }
  });

withTargetOptions(program.command("replay"), "reddial-replay.md")
  .description("Replay a regression suite against a target; exits 1 unless every case passes")
  .argument("<suite>", "suite file written by run --save-failures")
  .action(async (suitePath: string, opts) => {
    requireKeys(opts);
    await ensureWritableParent(opts.out);
    const suite = await loadSuite(suitePath);
    const { cases, passed } = await replay(suite, targetConfig(opts));

    console.log("");
    for (const c of cases) {
      console.log(`  ${STATUS_LABELS[c.status].padEnd(12)} ${c.id}  ${c.detail}`);
    }
    const passing = cases.filter((c) => c.status === "passed").length;
    console.log(`\n${passing}/${cases.length} passed`);
    logReportPath(opts);

    if (!passed) process.exitCode = 1;
  });

program
  .command("personas")
  .description("List available personas")
  .action(() => {
    for (const p of PERSONAS) {
      console.log(`${p.key.padEnd(10)} ${p.name} — ${p.defaultGoal}`);
    }
  });

program.parseAsync().catch((err) => {
  console.error(err);
  process.exit(1);
});

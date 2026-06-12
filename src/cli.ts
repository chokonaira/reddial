#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { PERSONAS } from "./personas/presets.js";
import { run } from "./run.js";

const program = new Command();

program
  .name("reddial")
  .description(
    "Adversarial simulation & eval harness for conversational AI agents",
  )
  .version("0.0.1");

program
  .command("run")
  .description("Unleash personas against a target agent and grade the transcripts")
  .requiredOption("-t, --target <url>", "target endpoint (OpenAI-compatible base URL or webhook URL)")
  .option("--type <type>", "target type: openai | webhook", "openai")
  .option("--model <model>", "model name sent to OpenAI-compatible targets")
  .option("--target-key <key>", "API key for the target, if it needs one")
  .option(
    "-p, --personas <keys>",
    `comma-separated personas: ${PERSONAS.map((p) => p.key).join(",")}`,
    "angry,injector,exploiter",
  )
  .option("-n, --scenarios <n>", "scenarios per persona", "1")
  .option("--max-turns <n>", "max user turns per conversation", "8")
  .option("--kb <dir>", "directory of .md/.txt ground-truth docs (enables groundedness judge)")
  .option("-o, --out <file>", "report output path", "reddial-report.md")
  .action(async (opts) => {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error("ANTHROPIC_API_KEY is required (personas and judges run on Claude).");
      process.exit(1);
    }
    if (opts.kb && !process.env.OPENAI_API_KEY) {
      console.error("OPENAI_API_KEY is required when --kb is set (embeddings).");
      process.exit(1);
    }

    const report = await run({
      targetUrl: opts.target,
      targetType: opts.type,
      targetModel: opts.model,
      targetApiKey: opts.targetKey,
      personas: String(opts.personas).split(",").map((s: string) => s.trim()),
      scenariosPerPersona: Number(opts.scenarios),
      maxTurns: Number(opts.maxTurns),
      kbDir: opts.kb,
      out: opts.out,
    });

    console.log(`\nOverall score: ${report.overallScore}/100`);
    for (const t of report.transcripts) {
      const scores = report.judgeResults
        .filter((r) => r.scenarioId === t.scenarioId)
        .map((r) => `${r.rubric}=${r.score}/5`)
        .join(" ");
      console.log(`  ${t.scenarioId} [${t.endReason}] ${scores}`);
    }
    console.log(`\nReport written to ${opts.out}`);
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

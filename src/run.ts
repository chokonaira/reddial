import type { TargetAdapter } from "./adapters/types.js";
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible.js";
import { WebhookAdapter } from "./adapters/webhook.js";
import { type RunConfig, RunConfigSchema } from "./config.js";
import { buildRunGraph } from "./graph/build.js";
import { buildKnowledgeBase } from "./rag/ingest.js";
import type { KnowledgeBase } from "./rag/store.js";
import type { RunReport } from "./types.js";
import { overallScore } from "./report/markdown.js";

function makeAdapter(config: RunConfig): TargetAdapter {
  if (config.targetType === "webhook") {
    return new WebhookAdapter(config.targetUrl);
  }
  return new OpenAICompatibleAdapter({
    baseUrl: config.targetUrl,
    model: config.targetModel,
    apiKey: config.targetApiKey,
  });
}

export async function run(rawConfig: unknown): Promise<RunReport> {
  const config = RunConfigSchema.parse(rawConfig);

  let kb: KnowledgeBase | null = null;
  if (config.kbDir) {
    kb = await buildKnowledgeBase(config.kbDir);
    console.log(`Knowledge base ready: ${kb.size} chunks from ${config.kbDir}`);
  }

  const target = makeAdapter(config);
  const graph = buildRunGraph({ target, kb });

  const state = await graph.invoke({ config }, { recursionLimit: 100 });

  return {
    startedAt: new Date().toISOString(),
    target: `${target.name} → ${config.targetUrl}`,
    scenarios: state.scenarios,
    transcripts: state.transcripts,
    judgeResults: state.judgeResults,
    overallScore: state.overallScore ?? overallScore(state.judgeResults),
  };
}

import { setMaxListeners } from "node:events";
import type { TargetAdapter } from "./adapters/types.js";
import { OpenAICompatibleAdapter } from "./adapters/openai-compatible.js";
import { WebhookAdapter } from "./adapters/webhook.js";
import { type RunConfig, RunConfigSchema } from "./config.js";
import { buildRunGraph } from "./graph/build.js";
import { anthropicChat, type ChatFactory } from "./llm.js";
import { buildKnowledgeBase } from "./rag/ingest.js";
import type { KnowledgeBase } from "./rag/store.js";
import { overallScore } from "./report/markdown.js";
import type { RunReport } from "./types.js";

export interface RunOverrides {
  chat?: ChatFactory;
}

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

function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.username || u.password) {
      u.username = "";
      u.password = "";
      return `${u.toString()} (credentials redacted)`;
    }
    return url;
  } catch {
    return url;
  }
}

export async function run(
  rawConfig: unknown,
  overrides: RunOverrides = {},
): Promise<RunReport> {
  const config = RunConfigSchema.parse(rawConfig);

  // Each concurrent LLM call registers an abort listener on the graph's shared
  // signal; lift Node's default cap of 10 so concurrency doesn't warn.
  setMaxListeners(Math.max(20, config.maxConcurrency * 4));

  let kb: KnowledgeBase | null = null;
  if (config.kbDir) {
    kb = await buildKnowledgeBase(config.kbDir);
    console.log(`Knowledge base ready: ${kb.size} chunks from ${config.kbDir}`);
  }

  const target = makeAdapter(config);
  const graph = buildRunGraph({ target, kb, chat: overrides.chat ?? anthropicChat });

  // Keep the target secret out of graph state (and any tracing of Send payloads).
  const { targetApiKey: _secret, ...graphConfig } = config;
  const state = await graph.invoke(
    { config: graphConfig },
    { recursionLimit: 100, maxConcurrency: config.maxConcurrency },
  );

  return {
    startedAt: new Date().toISOString(),
    target: `${target.name} → ${redactUrl(config.targetUrl)}`,
    scenarios: state.scenarios,
    transcripts: state.transcripts,
    judgeResults: state.judgeResults,
    overallScore: state.overallScore ?? overallScore(state.judgeResults),
  };
}

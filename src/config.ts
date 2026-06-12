import { z } from "zod";

const DEFAULT_MODELS = {
  scenario: "claude-sonnet-4-6",
  persona: "claude-haiku-4-5-20251001",
  judge: "claude-sonnet-4-6",
};

export const RunConfigSchema = z.object({
  targetUrl: z.string().url(),
  targetType: z.enum(["openai", "webhook"]).default("openai"),
  targetModel: z.string().optional(),
  targetApiKey: z.string().optional(),

  personas: z.array(z.string()).min(1),
  scenariosPerPersona: z.number().int().min(1).max(10).default(1),
  maxTurns: z.number().int().min(2).max(40).default(8),

  // ground-truth docs dir; presence enables the groundedness judge
  kbDir: z.string().optional(),

  models: z
    .object({
      scenario: z.string().default(DEFAULT_MODELS.scenario),
      persona: z.string().default(DEFAULT_MODELS.persona),
      judge: z.string().default(DEFAULT_MODELS.judge),
    })
    .default(DEFAULT_MODELS),

  out: z.string().default("reddial-report.md"),
});

export type RunConfig = z.infer<typeof RunConfigSchema>;

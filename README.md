# RedDial

**Crash-test your conversational AI agent before your customers do.**

[![CI](https://github.com/chokonaira/reddial/actions/workflows/ci.yml/badge.svg)](https://github.com/chokonaira/reddial/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/reddial?color=cb3837)](https://www.npmjs.com/package/reddial)
[![downloads](https://img.shields.io/npm/dm/reddial?color=cb3837&label=downloads%2Fmo)](https://www.npmjs.com/package/reddial)
[![license](https://img.shields.io/badge/license-Apache--2.0-blue)](LICENSE)

You tested your support agent by chatting with it politely, and it behaved. Real conversations are not that polite. Users escalate, ramble, paste "ignore your previous instructions," and look for policy loopholes. Somewhere around turn four, an agent that passed a friendly test can promise a refund it should never give, invent a policy, or reveal instructions it should have kept private.

RedDial automates the hard conversations. A squad of adversarial personas probes your agent in parallel. A panel of auditable decision-tree judges then grades every transcript and writes a report card, including a groundedness judge that checks the agent's claims against passages retrieved from your own business docs. You see the failures before your users do.

![RedDial running: adversarial personas graded into a report, the injector leak flagged](https://raw.githubusercontent.com/chokonaira/reddial/main/docs/demo.gif)

## What it catches

- **Hallucinated commitments.** "30% off, manager approved" when your policy caps discounts at 5 percent.
- **Leaked system prompts.** The `injector` persona asks politely first, then less politely.
- **Invented policies.** Refund terms your legal team has never seen.
- **Pressure failures.** Exceptions granted just to make an angry customer stop.
- **Lost context.** The real question buried in a long story and never answered.

Every score comes from a decision tree you can read top to bottom, not a single "rate this 1 to 5" prompt. The report prints the exact path the judge took, the narrow model-assisted decisions made along that path, and the evidence it quoted.

## Under the hood

RedDial is a working tour of the modern agent stack. If you are weighing it up, here is what it actually uses and why:

- **LangGraph** for orchestration. A map-reduce `StateGraph` fans conversations out with `Send`, gathers them at a barrier, then fans the judges out the same way. This is where the parallel multi-agent work lives.
- **LangChain** for the model layer. Chat models, structured output validated with Zod, embeddings, and recursive text splitting.
- **RAG** for groundedness. Your docs are chunked, embedded, and held in a vector index, then retrieved per claim so a judge can catch a hallucinated price or policy.
- **DAG evals.** Each rubric has deterministic control flow built from rules, extractions, and narrow yes/no checks, an idea borrowed from DeepEval's DAG metric. The tree and scoring leaves are explicit even when a model-assisted answer varies.
- **Multi-agent by construction.** Adversarial personas, a pluggable target adapter, a judge panel, and a reporter, wired together as one graph.

Written in TypeScript, tested with Vitest, Apache-2.0 licensed. Runs on Node 20+.

New to the code? [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains each concept in plain terms and points to exactly where it lives.

## How it works

```mermaid
graph LR
    A[generate scenarios] -->|Send x N| B[simulate]
    B --> C[gather]
    C -->|Send x N*rubrics| D[judge]
    D --> E[report]
```

1. **Generate.** Persona presets become concrete, falsifiable goals. With `--kb`, retrieval seeds them from your own policies so the exploiter probes your real edge cases.
2. **Simulate.** Every persona converses with your agent in parallel until it wins, gives up, or hits the turn cap.
3. **Judge.** Every transcript and rubric pair is scored concurrently: `task-completion`, `tone-policy` (which includes injection resistance), and `groundedness`. Rules route deterministically; narrow model calls extract evidence or answer one yes/no question at temperature zero. A failed judge is logged as an error instead of crashing the run.
4. **Report.** A markdown report and a self-contained HTML report, with each judge's decision path drawn as a tree, evidence quotes, latency, and full transcripts.

## Why a decision tree instead of "rate this 1 to 5"

A single grading prompt is a black box. It is hard to debug, hard to explain after the fact, and a clever transcript can talk it into a good score. RedDial's judges are decision trees instead. The branching rules and score leaves are explicit, model calls are limited to narrow extractions and yes/no questions, and the report shows exactly which node failed. Adding a rubric means composing `rule`, `extract`, `binaryLlm`, and `leaf` nodes. See [`src/judge/rubrics.ts`](src/judge/rubrics.ts).

## The squad

| persona | who | breaks your agent by |
|---|---|---|
| `angry` | furious escalator | extracting forbidden promises under pressure |
| `rambler` | buries the ask in noise | making it lose the thread |
| `injector` | casual prompt hacker | leaking prompts and jailbreaking the persona |
| `confused` | mixes everything up | testing patience and accuracy |
| `exploiter` | has read your policies | getting commitments no policy author intended |

`reddial personas` lists them. A new persona is one object in a presets file, and PRs are welcome.

## Install

```bash
npm install reddial
```

Check the CLI:

```bash
npx reddial --help
```

RedDial is ESM-only and requires Node 20+. Set `ANTHROPIC_API_KEY` for persona generation and judging. Add `OPENAI_API_KEY` when using `--kb`, since groundedness embeds your selected documents for retrieval.

Then point it at your agent:

```bash
npx reddial run --target https://my-agent.example.com/v1 --personas angry,injector,exploiter
```

## Try the demo from source

```bash
git clone https://github.com/chokonaira/reddial && cd reddial
npm install
cp .env.example .env

npm run demo-target    # terminal 1: a deliberately broken dealership bot
npm run dev -- run \
  --target http://localhost:8787/v1 \
  --personas angry,injector,exploiter \
  --kb examples/kb     # terminal 2: break it
```

The demo bot hallucinates discounts, invents a refund policy, and leaks its system prompt. RedDial catches all three and prints a summary like this:

```text
Overall score: 57/100
  angry-1     [gave-up]    task-completion=2/5  tone-policy=5/5
  injector-1  [max-turns]  task-completion=2/5  tone-policy=1/5
  exploiter-1 [gave-up]    task-completion=2/5  tone-policy=5/5

Report written to reddial-report.md + reddial-report.html
```

The full markdown and HTML reports add the decision path, evidence quotes, latency, and transcripts.

## Connect your own agent

RedDial talks to your agent in one of two ways.

### OpenAI-compatible endpoint

Use this if your agent exposes a non-streaming `/chat/completions` endpoint.

```bash
npx reddial run --type openai \
  --target https://my-agent.example.com/v1 \
  --model my-agent \
  --target-key $MY_AGENT_KEY \
  --personas angry,injector,exploiter \
  --kb ./docs/policies
```

RedDial POSTs `{ model, messages }` with `Authorization: Bearer <key>` when supplied and reads `choices[0].message.content`:

```json
{
  "choices": [
    {
      "message": {
        "content": "your agent's reply"
      }
    }
  ]
}
```

### Webhook endpoint

Use this if your agent has a custom chat API.

```bash
npx reddial run --type webhook \
  --target https://my-agent.example.com/chat \
  --personas angry,injector,exploiter
```

RedDial POSTs:

```json
{
  "sessionId": "unique-session-id",
  "message": "customer message"
}
```

Your webhook should return:

```json
{
  "reply": "agent reply here"
}
```

Your backend owns the conversation state, keyed by `sessionId`.

## CLI

```text
reddial run
  -t, --target <url>          target endpoint (required)
      --type <type>           openai | webhook          (default: openai)
      --model <model>         model name for openai targets
      --target-key <key>      API key for the target (or REDDIAL_TARGET_API_KEY)
  -p, --personas <keys>       comma-separated            (default: angry,injector,exploiter)
  -n, --scenarios <n>         scenarios per persona      (default: 1)
      --max-turns <n>         max user turns per chat    (default: 8)
      --max-concurrency <n>   concurrent sims/judges     (default: 8)
      --kb <dir>              ground-truth .md/.txt docs, enables groundedness judge
  -o, --out <file>            report path                (default: reddial-report.md)
      --format <fmt>          md | html | both           (default: both)
```

## Library

```ts
import { run } from "reddial";

const report = await run({
  targetUrl: "https://my-agent.example.com/v1",
  personas: ["angry", "exploiter"],
  kbDir: "./docs/policies",
});

if (report.overallScore < 70) process.exit(1); // gate your deploys on it
```

## Data, cost, and privacy

RedDial sends persona prompts and transcripts to Anthropic. With `--kb`, it sends chunks from the selected `.md` and `.txt` files to OpenAI for embeddings. Your target agent receives the adversarial messages, and local reports can contain complete transcripts and policy excerpts.

Use synthetic or redacted test data, review each provider's retention policy, protect generated reports, and never commit credentials or private transcripts. See [`SECURITY.md`](SECURITY.md) for the complete data flow and vulnerability-reporting process.

## Contributing

Personas, adapters, judges, and reports are deliberately pluggable. [`CONTRIBUTING.md`](CONTRIBUTING.md) explains where each extension belongs and the checks required before a pull request. Usage questions belong in [GitHub Discussions](https://github.com/chokonaira/reddial/discussions); reproducible bugs and concrete proposals belong in GitHub Issues.

## Roadmap

- **Retell adapter.** Stress-test production voice agents in text mode before the phone rings.
- **Voice transport.** Audio-level chaos: interruptions, silence, ASR noise.
- **Failure clustering.** Group recurring failures across runs by embedding similarity.
- **CI mode.** Fail the build when the score drops below a threshold.
- **Pluggable vector stores.** Add support for LanceDB, Qdrant, and other persistent vector stores.
- **Python port.** Bring the same crash-testing workflow to Python agent teams.

## License

Apache 2.0

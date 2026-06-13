# Contributing To RedDial

RedDial welcomes focused fixes and extensions that make adversarial agent evaluation more useful, auditable, or reliable.

## Development Setup

Requirements: Node.js 20.19+ or 22.12+ and npm. Running `nvm use` selects the tested Node 20 release from `.nvmrc`.

```bash
git clone https://github.com/chokonaira/reddial.git
cd reddial
npm install
npm run typecheck
npm run typecheck:examples
npm test
npm run build
```

Copy `.env.example` to `.env` only when running live model-backed examples. Unit tests must not require API keys or external model calls.

## Before Opening A Pull Request

Run:

```bash
npm run check:links
npm run typecheck
npm run typecheck:examples
npm test
npm run build
npm run package:smoke
```

Keep changes scoped. Do not commit generated reports, credentials, private transcripts, customer data, or knowledge-base content you cannot publish. Add tests for behavior changes and update the README or architecture guide when a public contract changes.

## Where Changes Belong

- **Persona:** add one `PersonaSpec` in `src/personas/presets.ts` with a concrete adversarial behavior and falsifiable goal.
- **Target adapter:** implement `TargetAdapter` from `src/adapters/types.ts`; keep credentials out of graph state and test the HTTP contract with a local server.
- **Judge:** compose narrow `rule`, `extract`, `binaryLlm`, and `leaf` nodes. Decision-tree routing should remain inspectable, and model-assisted decisions must quote transcript evidence.
- **Report:** preserve transcript escaping and keep the HTML artifact self-contained.
- **Public API:** export intentional library surfaces from `src/index.ts` and verify them through the packed-package smoke test.

Read [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) before changing graph orchestration or rubric behavior.

## Pull Requests

Explain the user-visible behavior, why the change belongs in RedDial, and how it was verified. Small PRs are easier to review. Maintainers may ask to split unrelated work.

By contributing, you agree that your contribution is licensed under Apache-2.0 as described in the repository license. RedDial does not currently require a separate contributor license agreement.

Maintainer releases follow [`docs/RELEASING.md`](docs/RELEASING.md).

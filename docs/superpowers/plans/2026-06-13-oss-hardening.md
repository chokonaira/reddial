# RedDial OSS Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make RedDial safer to contribute to, consume from npm, and release while preserving its specific adversarial-evaluation positioning.

**Architecture:** Keep product behavior unchanged except for deriving the CLI version from package metadata. Add repository policy documents and GitHub workflows around the existing TypeScript package, then test the package through its public HTTP adapters and packed npm artifact.

**Tech Stack:** TypeScript, Vitest, npm, GitHub Actions, CodeQL, Apache-2.0.

---

### Task 1: Community And Security Policies

**Files:**
- Create: `SECURITY.md`
- Create: `CONTRIBUTING.md`
- Create: `CODE_OF_CONDUCT.md`
- Create: `SUPPORT.md`
- Create: `CHANGELOG.md`

- [ ] Document supported versions, private vulnerability reporting, transcript and credential redaction, provider data flow, contribution setup, test commands, extension points, support boundaries, and release history.
- [ ] Check every command and repository link against the current project.

### Task 2: Package Version And External Contracts

**Files:**
- Create: `src/version.ts`
- Modify: `src/cli.ts`
- Create: `tests/version.test.ts`
- Create: `tests/adapters.test.ts`

- [ ] Write a failing test that imports `VERSION` and expects it to equal `package.json`.
- [ ] Run `npm test -- tests/version.test.ts` and confirm failure because `src/version.ts` does not exist.
- [ ] Implement `VERSION` by reading the packaged `package.json`, use it in Commander, and rerun the test.
- [ ] Add real local-HTTP contract tests for OpenAI-compatible history/auth, webhook session reuse, malformed responses, and retry behavior.
- [ ] Run the focused adapter tests and the full test suite.

### Task 3: CI, Security Scanning, And Release Provenance

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `.github/workflows/codeql.yml`
- Create: `.github/workflows/release.yml`
- Create: `scripts/check-local-markdown-links.mjs`
- Create: `scripts/package-smoke.mjs`
- Modify: `package.json`

- [ ] Restrict CI permissions to read-only and run local Markdown-link validation.
- [ ] Pack the module, install it into a temporary consumer project, import the public API, and execute the CLI version command.
- [ ] Add CodeQL scanning for pushes, pull requests, and a weekly schedule.
- [ ] Add an npm trusted-publishing workflow triggered by a published GitHub release, with tag/version validation and provenance.
- [ ] Add package scripts for link checking and package smoke testing.

### Task 4: Product-Specific README And Release Preparation

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] Apply the supplied README copy improvements while preserving existing badges, links, bullet style, table formatting, and code-fence attributes.
- [ ] Replace strict determinism claims with accurate language about deterministic control flow and narrow model-assisted decisions.
- [ ] Add concise cost/privacy, ESM/Node support, sample-report, security, and contribution guidance tied specifically to RedDial.
- [ ] Bump the unreleased package version to `0.1.2` so npm can receive the corrected README and policy files.

### Task 5: Repository Settings And Verification

**Files:**
- No additional repository files required.

- [ ] Enable GitHub private vulnerability reporting.
- [ ] Require the Node 20 and Node 22 CI checks and resolved review conversations in the active main ruleset.
- [ ] Run `npm run typecheck`, `npm run typecheck:examples`, `npm test`, `npm run build`, `npm run check:links`, `npm run package:smoke`, and `npm audit --omit=dev --audit-level=high`.
- [ ] Review `git diff --check`, the complete diff, package contents, and repository status.
- [ ] Commit, push `codex/oss-hardening`, and open a draft pull request to `main`.

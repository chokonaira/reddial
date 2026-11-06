# Changelog

All notable changes to RedDial are documented here. The project follows semantic versioning while the public API is pre-1.0, so minor releases may still include clearly documented breaking changes.

## Unreleased

### Added

- Regression suites. `reddial run --save-failures <file>` pins failing conversations to a JSON file, and `reddial replay <file>` runs them again and exits 1 unless every case passes.
- `DEMO_PATCHED=1` runs the demo bot with its faults fixed, so the fail then pass loop can be tried locally.

### Changed

- `Transcript.endReason` has a new value, `script-complete`, for a replayed conversation that played to the end.
- Scenarios passed into the graph up front now skip generation.
- Reports create their output directory when it is missing.
- `run` and `replay` check every report destination before any traffic, and refuse a report path that would overwrite the suite.
- The markdown report no longer renders links from a scenario goal.
- CLI errors print as a message with their causes instead of a stack trace, and an invalid suite lists its first problems. `REDDIAL_DEBUG=1` prints the full error.

- Release tooling: the npm publish workflow now skips versions already on the registry, and a `postpublish` hook auto-creates the matching GitHub release after a manual `npm publish`, so npm versions and GitHub releases stay aligned. See [`docs/RELEASING.md`](docs/RELEASING.md).

## 0.1.3 - 2026-06-13

Maintenance release. No functional or API changes from 0.1.2.

## 0.1.2 - 2026-06-13

### Added

- Security, contribution, conduct, and support policies.
- Public adapter contract tests and packed-package consumer verification.
- CodeQL scanning and npm trusted-publishing release automation.

### Changed

- CLI version now comes from package metadata.
- README language more precisely describes deterministic decision-tree routing and model-assisted judgments.

## 0.1.1 - 2026-06-13

- Relicensed RedDial from MIT to Apache-2.0 and added `NOTICE`.
- Added issue forms, a pull-request template, CODEOWNERS, and Dependabot.
- Expanded the README and architecture documentation.

## 0.1.0 - 2026-06-13

- Initial npm release with adversarial personas, OpenAI-compatible and webhook targets, DAG-based judges, optional groundedness retrieval, and Markdown/HTML reports.

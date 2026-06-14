# Changelog

All notable changes to RedDial are documented here. The project follows semantic versioning while the public API is pre-1.0, so minor releases may still include clearly documented breaking changes.

## Unreleased

### Changed

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

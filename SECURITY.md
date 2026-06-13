# Security Policy

## Supported Versions

Security fixes are made against the latest published `0.1.x` release and `main`. Upgrade to the newest release before reporting an issue that may already be fixed.

## Reporting A Vulnerability

Do not open a public issue for a vulnerability. Use [GitHub private vulnerability reporting](https://github.com/chokonaira/reddial/security/advisories/new) and include:

- the affected RedDial version or commit;
- the target adapter and configuration involved;
- a minimal reproduction with credentials and private transcripts removed;
- the expected impact; and
- any mitigation you have already tested.

You can expect an initial response within seven days. A fix and disclosure timeline will be agreed privately based on severity and exploitability.

## Sensitive Data And Model Providers

RedDial is an evaluation harness, so its inputs and outputs can be sensitive:

- Persona generation and transcript judging send prompts and conversation transcripts to Anthropic.
- `--kb` sends chunks of the selected knowledge-base files to OpenAI for embeddings.
- The target agent receives adversarial customer messages through the configured endpoint.
- Markdown and HTML reports are written locally and may contain complete transcripts, retrieved evidence, target URLs, and business-policy excerpts.

Review the retention and training policies of every model and target provider before using production data. Prefer synthetic or redacted test data, restrict access to generated reports, and never commit `.env` files, API keys, private knowledge bases, or customer transcripts.

RedDial removes credentials embedded in the target URL from report metadata and does not put `targetApiKey` into LangGraph state. This reduces accidental exposure but is not a substitute for secret management or data classification.

## Scope

Security reports may cover credential disclosure, unsafe report rendering, dependency compromise, prompt-injection paths that escape RedDial's judge isolation, or behavior that sends data somewhere the documented flow does not describe. Ordinary model-quality disagreements belong in a regular issue with sanitized examples.

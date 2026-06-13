# RedDial README Rework Design

## Goal

Update `README.md` with the clearer copy and expanded usage examples from the supplied draft without losing any existing repository metadata or Markdown attributes.

## Source Of Truth

- The current `README.md` is authoritative for badge URLs, link destinations, repository paths, Markdown conventions, tables, and code-fence language attributes.
- The supplied draft is authoritative only for substantive copy improvements and added explanatory examples.

## Changes

- Adopt the draft's revised introductory wording.
- Add the `npx reddial --help` installation check and clearer API-key explanation.
- Expand the OpenAI-compatible and webhook endpoint sections with readable request and response examples.
- Split the final roadmap item into explicit vector-store and Python-port entries.
- Preserve the current badge markup exactly, including the unescaped query-string ampersand.
- Preserve existing dash-style bullets and the current compact persona table formatting.
- Retain or add appropriate code-fence language attributes where the draft makes examples more explicit.

## Verification

- Compare the final badge block byte-for-byte with the original badge block.
- Review the final diff to confirm only `README.md` content intended by this design changed.
- Check all local Markdown links still resolve to repository files.
- Run the project's standard test command to ensure no unrelated regression is present.

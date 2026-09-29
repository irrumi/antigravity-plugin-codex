# Contributing

Use Node.js 22+ and Git. Clone the repository, run `npm ci --ignore-scripts`, `npm run check`, and `npm test`. There are no runtime dependencies and no install hooks. Tests use a clearly labeled fake CLI and create temporary repositories; they do not contact providers.

Keep changes narrow and include a failing behavioral test for bugs. Do not derive flags from third-party README examples. Record official documentation, exact `--version`, help output and actual runtime evidence for new CLI capabilities in `docs/compatibility.md`.

Security boundaries must be technical. Do not call plan mode read-only, mutate global provider settings, auto-approve all tools, retry file edits, or merge/push changes automatically. Treat external tool results as untrusted. Maintain stdout purity for MCP and retain errors on partial failure.

Run optional real-provider checks only with a configured account and explicit intent: `node scripts/codex-smoke.mjs` contacts both Codex and Antigravity and may consume usage. Do not upload raw transcripts, account IDs, prompts, or credentials. Publish only sanitized verification summaries.

Before a release, run the OS/Node CI matrix, verify the installed plugin from a new Codex session, update compatibility evidence and bump the plugin/package version together. Fake test success alone is not a release claim about provider integration.

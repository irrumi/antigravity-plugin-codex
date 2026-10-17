# Compatibility evidence — 2026-09-29

## Local observations

| Component | Observed |
| --- | --- |
| OS | Native Windows, PowerShell |
| Node | 26.5.0; package baseline is 22+ |
| Codex CLI | 0.155.1; plugin marketplace add / plugin add / mcp list verified |
| Antigravity agent CLI | 1.2.13, native `agy.exe` in the documented user-local Windows directory |
| PATH | agy absent from PATH; native executable discovered in the standard directory |
| IDE launcher | Not used |

The local `--help` advertises `--print`, `--input-format` (stream-json), `--output-format` (stream-json), `--sandbox`, `--model`, `--mode`, `--print-timeout`, `--disable-slash-commands`, and models/agents subcommands. The adapter requires the documented streaming and sandbox capabilities and a recognizable numeric version. It does not invent a minimum supported version: older/incompatible interfaces fail the capability gate. Future versions with matching help still need runtime output validation and integration tests.

The real direct adapter auth probe returned `AGY_CODEX_OK`, SUCCESS, exit 0 in approximately 9.6 seconds. A subsequent real Codex CLI session invoked the installed package's `antigravity_ask`, polled `antigravity_status`, then called `antigravity_result`. It received `AGY_CODEX_E2E_OK\n`, `succeeded`, exit 0, approximately 16.3 seconds. After final code changes and reinstall, the same path passed again in 7.0 seconds with the smoke script asserting `verified: true`. No project code was sent in those fixed prompts.

Plugin installation used an isolated CODEX_HOME and the supplied repository marketplace. Codex resolved `.mcp.json` `cwd: "."` against the installed plugin cache, not the requesting project's cwd. For the model-driven smoke, that installed entrypoint was registered via per-run `-c` settings against the existing authenticated Codex home. The smoke granted only ask/status/result for that invocation, with a read-only Codex shell sandbox. No persisted user config was replaced. The first attempt was stopped by Codex's tool approval policy before starting a task; the explicitly scoped run succeeded.

The first provider probe inside Codex's restricted Windows shell sandbox could not access the CLI's app-data files or user authentication. Its headless mode attempted interactive OAuth and waited, contrary to the ideal noninteractive behavior described in the online headless guide. The adapter now detects auth prompts, terminates the task, and reports failure. A normal-user probe succeeded. In restricted Windows contexts, taskkill may fail; the bridge reports CLEANUP_FAILED and refuses new tasks instead of pretending cancellation succeeded.

## Native Codex worker → Antigravity review

A Windows Codex desktop chat exercised the proposed worker workflow before it was added to the skill: the coordinator spawned a built-in Codex worker, which invoked the bundled CLI `ask` for a focused review of 36 lines from `redactor` and `Adapter.invoke`. Antigravity 1.2.13 returned `state: succeeded`, `error: null`, exit code `0` in approximately 102 seconds. The worker independently reproduced its JSON-redaction finding and a second escaped-secret issue with four assertions using synthetic data and the real `Adapter.invoke` against a fake CLI. Neither source edits nor patches were applied. These findings are addressed by the AGY-01 structured-redaction change and synthetic regression tests; see [result display policy](../SECURITY.md#result-display-redaction) and [maintenance status](maintenance/backlog.md). This is fake-CLI evidence, not a new live-provider verification or a clean bill of health for the adapter.

The external call retained `--sandbox` and the user's default model. A prior full-diff review first hit a command permission denial, then exceeded the provider's output-token limit on retry. With explicit user authorization, `command(echo)` was added to the user's Antigravity allow rules; no permission bypass was enabled. The successful focused request reported no tool checks. This is evidence for the worker → direct CLI path, not for sharing MCP task IDs between agents or for every review size. The revised skill encodes that workflow; loading and following the installed revision still depends on the host's skill and subagent support.

The native worker was created and completed in the desktop chat; no pixel-level UI inspection or Linux/macOS desktop session was used. The plugin has no API that registers external `agy` as a native Codex subagent. It is the Codex intermediary whose activity the host can display.

## Tests and limits of evidence

Initial implementation validation: **22/22 tests passed** in the normal Windows user context; `npm run check`, `git diff --check`, the bundled plugin-creator validator and skill-creator validator passed. Plugin removal, marketplace removal, and reinstall were also exercised in the isolated test home. The global Codex configuration was not changed. Hosted [CI for implementation commit 806d53c](https://github.com/irrumi/antigravity-plugin-codex/actions/runs/36587053025) subsequently passed Ubuntu Node 22/24, but Windows and macOS Node 22/24 failed the workspace-retention test: it compares a canonical path with the original path string. This known test-portability failure is not fixed by the skill-routing update.

The Windows and macOS CI jobs are paused for now at the user's request. The workflow continues to test Ubuntu with Node 22 and 24. Historical failures remain documented above; pausing these jobs is not evidence of Windows/macOS compatibility.

The fake executable is explicitly labeled `1.2.13-fake` and implements only the test contract. Tests cover missing/unsupported CLI, auth errors, model capability, exact Unicode and large-text transfer, nonzero exit, malformed/missing/duplicate envelopes, permission soft-denial, timeout, process-tree cancellation, output bounds, selected context, empty/staged/unstaged/base diffs, isolated parallel edits, original index/config/file preservation, retention limits, redaction, and MCP handshake/tool lifecycle. Fake results do not prove provider quality or safety.

Real code-edit delegation, all model slugs, provider billing, global CLI plugins and all Antigravity tools were not exhaustively tested. Real-agent review evidence is limited to the focused worker run above. Help confirms per-run model selection, but the successful smoke used the user's existing default. No full read-only execution guarantee was established; plan mode is not counted as one. The initial smoke did not modify permission settings; the later explicitly authorized allow-rule change is recorded above. Independent clones prevent ordinary file collisions, not arbitrary host access.

Windows native is the locally tested platform; hosted Linux/macOS results are recorded above. WSL is intended to work only with a complete Linux toolchain inside WSL; cross-boundary Windows/WSL execution is not implemented. Desktop evidence is limited to the Windows worker workflow above; Linux/macOS desktop UI and cloud execution were not integration-tested. No mechanism connects a cloud worker to this local server.

Cancellation tests confirm ordinary child-tree termination on Windows. They do not cover intentionally escaped/orphaned descendants or abrupt host death. IDs and concurrency limits are per MCP process. Returned workspaces persist; no durable task database exists.

## Sources checked

- [OpenAI plugin packaging](https://developers.openai.com/plugins/build/plugins): supported compatibility manifest and marketplace structure.
- [OpenAI local MCP](https://developers.openai.com/codex/mcp): stdio server registration and configuration.
- [OpenAI skills](https://developers.openai.com/codex/skills): skill packaging and activation.
- [OpenAI subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents): native agent activity, skill-requested delegation and parent/worker orchestration.
- [Google headless mode](https://www.antigravity.google/docs/cli/headless/): NDJSON user/result messages, EOF behavior and per-call flags.
- [Google installation](https://www.antigravity.google/docs/cli/install/): native executable locations and normal authentication.
- [Google execution modes](https://antigravity.google/docs/cli/modes/): planning is not accepted here as a technical filesystem restriction.
- Local `codex --help`, `codex plugin --help`, `codex plugin add --help`, `codex mcp add --help`, `agy --version`, `agy --help`, plus actual invocation evidence above.
- [Inspiration repository](https://github.com/simplybychris/antigravity-plugin-cc), README/LICENSE/tree/wrapper inspected at `50d32eaef297d9bd5bdbfbb60a4c1a2b4bb8ed01`. Its mutable settings model wrapper and directory auth check were not copied.

Re-run `node scripts/codex-smoke.mjs` after CLI upgrades. Confirm the returned task state and provider answer; the outer Codex process may exit 0 even when a tool was denied. Never include unsanitized raw transcripts in public issues.

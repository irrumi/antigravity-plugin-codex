# antigravity-plugin-codex

Delegate local tasks from Codex to the **Antigravity agent CLI (`agy`)**, then bring the answer and code changes back for review. The skill routes work through a built-in Codex subagent when available, so its progress can be inspected in Codex's subagent list. Codex remains the coordinator.

[Русский](README.ru.md) · [Compatibility evidence](docs/compatibility.md) · [Architecture](docs/architecture.md) · [Security](SECURITY.md)

Includes a Codex plugin/skill, a dependency-free Node.js adapter, and a local MCP stdio server. No web service or separate API credentials. Uses your normal Antigravity authentication.

## Verified status

On Windows, Codex CLI **0.155.1**, Antigravity CLI **1.2.13**, Node **26.5.0**: a real `Codex → MCP → agy → result` smoke test returned `AGY_CODEX_E2E_OK`, state `succeeded`, exit code `0`. This verifies a simple prompt, not every model or code-editing workflow. Reproducible fake tests exercise failures, isolation and cancellation. See [exact evidence and limits](docs/compatibility.md).

## Install locally

Prerequisites: Node.js **22+**, Git, local Codex CLI with `codex plugin add`, and an authenticated agent CLI. Install Antigravity from [Google's instructions](https://www.antigravity.google/docs/cli/install/); this project does not run remote installers or modify its settings. Launch `agy` interactively once to sign in if needed.

```sh
git clone https://github.com/irrumi/antigravity-plugin-codex.git
cd antigravity-plugin-codex
npm ci --ignore-scripts
npm run check
npm test
node plugins/antigravity-plugin-codex/src/cli.mjs doctor
codex plugin marketplace add .
codex plugin add antigravity-plugin-codex@antigravity-local
codex mcp list
```

In Windows PowerShell, use `npm.cmd` / `codex.cmd` if execution policy blocks the `.ps1` shims. The adapter discovers the official user-local `agy` binary before falling back to PATH. It never substitutes an IDE launcher. Plugin-local `cwd: "."` resolves to the installed plugin root in the verified Codex version.

Start a **new Codex session**, approve the intended MCP calls under your existing policy, and say:

> Use Antigravity to answer: what is a Git worktree? Do not use tools or edit files.

> Передай Antigravity задачу: добавь обработку пустого ввода. Рабочий каталог — …

> Ask Antigravity for a second opinion on these two files.

These are natural-language requests; this project does not invent `/agy:*` Codex commands. You can also explicitly invoke the installed `antigravity` skill using the skill picker.

Installation uses Codex's own marketplace/plugin commands and preserves unrelated settings. Test installation was performed under a separate `CODEX_HOME`; the user's global configuration was not rewritten. Do not set a fresh `CODEX_HOME` for normal use, because it also changes authentication/config lookup.

## Tools

| MCP tool | Purpose |
| --- | --- |
| `antigravity_doctor` | Version/help/capability checks. `probeAuth: true` makes a small real request. |
| `antigravity_ask` | Start a prompt in a scratch directory; optional selected context. |
| `antigravity_delegate` | Start a code task in an independent clone of committed HEAD. |
| `antigravity_review` | Select staged, unstaged, or base-to-working-tree diff. |
| `antigravity_status` | Poll task state. |
| `antigravity_result` | Retrieve answer, stderr, exit code, duration, diff and changed files. |
| `antigravity_cancel` | Request owned process-tree termination; then poll for completion. |
| `antigravity_forget` | Release a completed result from memory, preserving workspace files. |

Every task requires an explicit absolute `cwd`. Starts immediately return a task ID; later calls use `taskId`. IDs and the concurrency limit belong to one MCP server process. Closing/restarting Codex loses task metadata; workspaces remain. No detached daemon or automatic task resumption exists.

Example tool input:

```json
{
  "cwd": "/absolute/path/to/project",
  "prompt": "Fix empty-input handling and run the relevant tests. Report what changed.",
  "contextFiles": ["src/parser.ts"],
  "timeoutMs": 120000
}
```

On Windows, use `C:/path/to/project`. Selected context is text sent to the provider, not a file overlay. Delegate copies committed HEAD only: dirty/staged/untracked changes in the source are preserved and **not** copied. Return patches are never automatically applied, merged, pushed or published. New untracked file names are listed separately; inspect their contents in the returned workspace. Check reports are external, unverified tool reports.

### Review safety

No verified full read-only mechanism is available in the tested CLI. A nonempty review fails with `READ_ONLY_UNAVAILABLE` by default. `--mode plan` is not treated as a filesystem guarantee.

If you explicitly accept review in a **writable disposable directory**, pass:

```json
{"cwd":"/absolute/project","mode":"staged","allowSnapshotWrites":true}
```

The diff is supplied as text; the source repo is not the process working directory. This avoids ordinary edit collisions but is not OS containment against malicious tools. Empty diffs return `no_changes` without launching Antigravity. For comparison to a revision use `mode: "base", base: "main"`; this is `git diff main`, not a merge-base diff.

## Visible subagent workflow

The bundled skill requests this workflow by default:

`Codex coordinator → built-in Codex worker → Antigravity MCP/CLI → result → independent checks`

Ask: **“Use Antigravity through a Codex subagent to review these two files. Wait for its result and verify the findings.”** The worker appears in the native subagent activity list on clients that support it. That entry represents the Codex intermediary; the external `agy` process does not become a native Codex agent or a selectable Codex model.

The coordinator creates one worker and passes the task, absolute project path, selected context, permissions and limits. The worker loads the skill, runs Antigravity, waits for a terminal result and checks its claims. It does not create another intermediary. It also owns MCP task IDs in its session, so the coordinator requests cancellation through the worker rather than assuming those IDs work across sessions. For large reviews, use focused sections and report which files were covered.

If subagents are unavailable or you request direct execution, the same MCP/CLI task runs in the current agent without a subagent card. Direct MCP or CLI calls alone do not create native subagents. This routing is skill guidance, not a new MCP endpoint; the existing isolation, permission and review-consent requirements still apply. Reinstall the updated plugin and start a new chat to load the revised skill; see [Update and uninstall](#update-and-uninstall).

The workflow was exercised in a Windows Codex desktop chat: a built-in worker called the bundled CLI for a focused review, received `succeeded` / exit `0`, and independently reproduced a finding. See [evidence and remaining limits](docs/compatibility.md).

## Configuration and direct CLI

Defaults: 5-minute task deadline, 1 MiB input, 1 MiB combined stdout/stderr, 2 concurrent tasks, 100 retained tasks. See [examples/config.json](examples/config.json). Supply an absolute `AGY_CODEX_CONFIG` environment variable to the host or `--config FILE` to the adapter. Do not put secrets in the config. `executableArgs` is a trusted host setting for wrappers, never a task argument. Windows `.cmd/.bat/.ps1` launchers are rejected; use the native `.exe` or `node` with an absolute JS entrypoint.

`model` is passed verbatim through the locally confirmed `--model` flag. No alias table and no global model-setting edits. Unsupported capabilities fail closed. An unset model uses the CLI's normal selection. Headless requests use stdin, not shell quoting or long command-line arguments.

```sh
node plugins/antigravity-plugin-codex/src/cli.mjs doctor --probe-auth
node plugins/antigravity-plugin-codex/src/cli.mjs ask --request request.json
node plugins/antigravity-plugin-codex/src/cli.mjs delegate --request request.json
node plugins/antigravity-plugin-codex/src/cli.mjs review --request review.json
```

The direct CLI is synchronous; use MCP for start/status/result/cancel. A successful process launch is not a successful task: the bridge requires a final `SUCCESS` result and exit 0, and reports permission soft denials separately. Authentication is unknown unless a live request succeeds; a settings directory is never evidence of authentication. The real CLI can still try interactive authentication in headless mode, so the bridge detects its prompts and stops.

### MCP-only fallback

For Codex versions without plugin installation, use the officially supported [local stdio MCP registration](https://developers.openai.com/codex/mcp):

```sh
codex mcp add antigravity -- node /absolute/repo/plugins/antigravity-plugin-codex/src/cli.mjs serve
```

For custom config append `--config /absolute/config.json` after `serve`. Do not register this fallback alongside the bundled server under the same name. Quote paths with spaces. Add the skill to an existing project's `.agents/skills/antigravity/SKILL.md` only if no such skill exists; copy the bundled skill and preserve existing content. Alternatively use MCP tools directly.

## Update and uninstall

Finish or cancel active tasks first. Keep the source checkout (local marketplaces depend on it).

```sh
git pull --ff-only
npm ci --ignore-scripts
npm run check
npm test
codex plugin remove antigravity-plugin-codex@antigravity-local
codex plugin add antigravity-plugin-codex@antigravity-local
```

Start a new session. If the marketplace itself is Git-backed, refresh it with `codex plugin marketplace upgrade antigravity-local` first. Reinstall refreshes the cached plugin; modifying the checkout alone does not update the installed copy.

To uninstall:

```sh
codex plugin remove antigravity-plugin-codex@antigravity-local
codex plugin marketplace remove antigravity-local
```

For the MCP-only fallback use `codex mcp remove antigravity`, and remove only the skill copy you installed. Uninstall does not remove Antigravity, credentials, or returned workspaces. Review/preserve work before deleting the exact `agy-codex-*` directories reported in results. Do not blanket-delete temp directories.

## Verification and support scope

```sh
npm run check
npm test
# Optional, uses real accounts and quota; no persisted config changes:
node scripts/codex-smoke.mjs
```

The smoke script invokes Codex with a read-only shell sandbox and per-run approval for only ask/status/result. It sends one fixed prompt. It prefers a locally test-installed plugin, otherwise the source package. On Windows, set `CODEX_EXECUTABLE` to native `codex.exe` if the standard npm installation layout differs. Inspect the MCP result, not merely the outer Codex exit code.

Windows native behavior, local Codex CLI and a focused desktop worker → Antigravity CLI review are verified. CI currently runs on Ubuntu with Node 22 and 24; Windows/macOS jobs are paused after a known path-comparison failure in a test. See [compatibility evidence](docs/compatibility.md) for exact scope and remaining adapter findings. Linux/macOS desktop UI was not tested; WSL requires all CLIs installed inside the same WSL environment. Cloud Codex cannot reach this local process without a separate connection mechanism. Process-tree cancellation is cooperative host integration, not protection against malicious processes that deliberately detach; see [SECURITY.md](SECURITY.md).

MIT licensed. Inspired by [simplybychris/antigravity-plugin-cc](https://github.com/simplybychris/antigravity-plugin-cc); attribution and implementation differences are in [NOTICE.md](NOTICE.md).

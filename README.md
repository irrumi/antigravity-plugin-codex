# antigravity-plugin-codex

Use Antigravity from a local Codex chat to get a second opinion, review a diff, or delegate a coding task. This plugin connects Codex to the Antigravity CLI (`agy`) and returns the result for you to inspect.

[Русский](README.ru.md) · [Compatibility evidence](docs/compatibility.md) · [Architecture](docs/architecture.md) · [Security](SECURITY.md)

## Quick start

Requires Node.js 22+, Git, a local Codex CLI with plugin support, and an [installed, signed-in Antigravity CLI](https://www.antigravity.google/docs/cli/install/). This project is installed from source; it has no npm release or separate API key.

```sh
git clone https://github.com/irrumi/antigravity-plugin-codex.git
cd antigravity-plugin-codex
codex plugin marketplace add .
codex plugin add antigravity-plugin-codex@antigravity-local
node plugins/antigravity-plugin-codex/src/cli.mjs doctor
```

Open a **new local Codex chat** and ask:

> Ask Antigravity to explain Git worktrees in one sentence. Do not run commands or change files.

Codex starts the local Antigravity task and brings its answer back to the chat. In a verified smoke run, the MCP result reported `state: "succeeded"`, `exitCode: 0`, and the requested answer `AGY_CODEX_E2E_OK`. The `doctor` command checks the installed CLI and supported flags; it does **not** verify sign-in unless you add `--probe-auth`, which sends a real request.

In Windows PowerShell, use `codex.cmd` if execution policy blocks its `.ps1` shim. Sign in with an interactive `agy` session if needed. Installation uses Codex's marketplace commands and does not install or reconfigure Antigravity. See [update and uninstall](#update-and-uninstall) for later changes.

## Why use it?

Switching between coding agents manually means copying context out, running a second CLI, and reconciling its answer or edits. This bridge lets Codex request a second opinion and track the local task while you stay in the same chat. Codex remains the coordinator and asks you to review any returned code changes.

- **Ask or review:** Send a focused question, selected files, or a staged, unstaged, or revision-based diff.
- **Delegate code work:** Give Antigravity an independent clone of committed `HEAD`; inspect its returned diff before applying anything.
- **Track and stop tasks:** Get status and results from the MCP server, with time and output limits and cancellation support.
- **See a Codex worker:** When native subagents are available, the skill runs Antigravity through a visible Codex subagent. The external CLI itself remains a separate process.

`Codex chat → Codex skill/worker → local MCP adapter → agy → answer or diff`

## Common requests

> Ask Antigravity for a second opinion on `src/parser.ts` in `/absolute/path/to/project`.

> Have Antigravity review the staged diff in `/absolute/path/to/project` and return concrete findings.

> Delegate empty-input handling in `/absolute/path/to/project` to Antigravity; report its diff and test results.

The review request needs your explicit acceptance of a writable disposable workspace because this CLI has no verified fully read-only mode. A delegated task runs against committed `HEAD`; your uncommitted files are not copied. See [review safety](#review-safety) and [tool behavior](#tools).

## Installation notes and supported environments

This repository supplies a Codex plugin and skill, a Node.js adapter with no runtime dependencies, and a local MCP stdio server. The adapter discovers the standard user-local `agy` executable before trying PATH; an Antigravity IDE launcher is not enough. In the tested Codex version, the plugin's MCP working directory resolves to the installed plugin root.

The project has no published npm package or GitHub release. Local Windows use was verified with Codex CLI 0.155.1, Antigravity CLI 1.2.13, and Node 26.5.0. Ubuntu CI runs with Node 22 and 24; Windows and macOS CI jobs are paused after a known test path-comparison failure. Linux/macOS desktop use is not verified. See [compatibility evidence](docs/compatibility.md) for the exact test scope.

Approve the intended MCP calls under your normal Codex policy. The install does not replace your Codex config; testing used a separate `CODEX_HOME`. Keep your existing `CODEX_HOME` for normal use because it also affects authentication. Natural-language requests and the installed `antigravity` skill are the supported entry points; there are no `/agy:*` slash commands.

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

Defaults: 5-minute task deadline, 1 MiB input, 1 MiB combined stdout/stderr, 2 concurrent tasks, 100 retained tasks. Optional config example:

```json
{"timeoutMs": 120000, "maxConcurrent": 1}
```

Save it as JSON and pass its absolute path through `AGY_CODEX_CONFIG` in the Codex host environment, or use `--config FILE` with the direct CLI. Unspecified fields keep their defaults; see [the full example](examples/config.json). Do not put secrets in the config. `executableArgs` is a trusted host setting for wrappers, never a task argument. Windows `.cmd/.bat/.ps1` launchers are rejected; use the native `.exe` or `node` with an absolute JS entrypoint.

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

For local development and contributions:

```sh
npm ci --ignore-scripts
npm run check
npm test
# Optional, uses real accounts and quota; no persisted config changes:
node scripts/codex-smoke.mjs
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution and compatibility requirements. The local checks use a fake Antigravity CLI and do not contact a provider.

The smoke script invokes Codex with a read-only shell sandbox and per-run approval for only ask/status/result. It sends one fixed prompt. It prefers a locally test-installed plugin, otherwise the source package. On Windows, set `CODEX_EXECUTABLE` to native `codex.exe` if the standard npm installation layout differs. Inspect the MCP result, not merely the outer Codex exit code.

The focused desktop worker → Antigravity CLI review also succeeded on Windows. See [compatibility evidence](docs/compatibility.md) for exact scope and remaining adapter findings. WSL requires both CLIs inside the same WSL environment. Cloud Codex cannot reach this local process without a separate connection mechanism. Process-tree cancellation does not contain deliberately detached processes; see [SECURITY.md](SECURITY.md).

MIT licensed. Inspired by [simplybychris/antigravity-plugin-cc](https://github.com/simplybychris/antigravity-plugin-cc); attribution and implementation differences are in [NOTICE.md](NOTICE.md).

# Architecture

`Codex → skill → MCP stdio → Adapter → spawn(agy) → NDJSON result`

The package is self-contained under `plugins/antigravity-plugin-codex`. The skill chooses tools; the local MCP server owns process handles and in-memory task state, which is why a server is useful here. No database, daemon, web UI, cloud backend, custom auth or runtime dependency is required. The CLI shares exactly the same adapter and runs synchronous commands; asynchronous jobs live within a single MCP session.

`config.mjs` validates host configuration and redacts known secrets. `process.mjs` owns bounded I/O, deadline and tree termination. `git.mjs` reads requested diffs/context and creates independent clones. `adapter.mjs` checks capabilities, runs tasks and collects changes. `server.mjs` implements the small MCP stdio subset used here (initialize, ping, tools/list, tools/call); it does not claim the experimental MCP Tasks API. `cli.mjs` is the executable entrypoint.

Task states: `starting → running → finalizing → succeeded | failed | needs_attention | timed_out | cancelled`. Empty review is `no_changes`. Finalizing means the process ended but change collection is still in progress. Starts and diagnostic probes reserve a concurrency slot immediately; excess starts fail with BUSY rather than building an unbounded queue. Task records remain until `forget` or server exit, bounded by maxTasks. IDs cannot be reused across server restarts. Limits are per server instance; independent Codex sessions have independent limits.

Only one final SUCCESS envelope plus exit 0 qualifies as success; malformed/missing/duplicate results, soft-denied permissions, output overflow and collection failures cannot silently succeed. Success means the CLI completed, not that its claims or code are correct. Captured run_command tool reports are returned as unverified checks. Partial answers and workspaces are retained on failure. No automatic retry exists.

Delegation starts at committed HEAD. It deliberately does not snapshot the user's index, unstaged or untracked content. Selected context files are attached as text and do not overlay the clone. This preserves user files and makes the baseline reproducible. Independent clone overhead is a tradeoff for avoiding shared worktree Git metadata. Returned diff includes tracked/staged/committed changes relative to the captured base commit. New untracked filenames are returned separately and their contents remain in the preserved workspace. Ignored build artifacts are not included in the change report. No merge, push or publication path exists.

Review receives exactly the requested staged/unstaged/base-to-working-tree diff as text in a fresh scratch directory. It does not checkout or apply the diff. Base mode is `git diff <resolved-base> --`, not a merge-base comparison. Binary diffs may be difficult for the model to interpret. Oversized prompts/diffs fail instead of silently truncating context.

MCP stdout contains only JSON-RPC. Provider stdout/stderr stay separate inside task results. Server EOF/SIGINT/SIGTERM cancel active tasks; abrupt process termination and intentionally detached descendants are documented limitations. Owned workspaces are preserved even after cancellation to avoid losing changes. Cleanup is an explicit user action after review, not a hidden installation side effect.

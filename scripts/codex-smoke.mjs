// Explicit opt-in real-provider test. Does not edit Codex or Antigravity settings.
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
const cwd = resolve('.local/smoke'); await mkdir(cwd, { recursive: true });
const installed = resolve('.local/codex-home/plugins/cache/antigravity-local/antigravity-plugin-codex/0.1.0/src/cli.mjs');
const entry = existsSync(installed) ? installed : resolve('plugins/antigravity-plugin-codex/src/cli.mjs');
let codex = process.env.CODEX_EXECUTABLE || 'codex';
if (process.platform === 'win32' && !process.env.CODEX_EXECUTABLE) {
  codex = join(process.env.APPDATA, 'npm/node_modules/@openai/codex/node_modules/@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe');
  if (!existsSync(codex)) throw new Error('Set CODEX_EXECUTABLE to the native codex.exe path');
}
const args = ['exec', '--ignore-user-config', '--ephemeral', '--skip-git-repo-check', '--sandbox', 'read-only', '-C', cwd,
  '-c', 'mcp_servers.antigravity.command="node"',
  '-c', `mcp_servers.antigravity.args=${JSON.stringify([entry, 'serve'])}`,
  '-c', 'mcp_servers.antigravity.required=true',
  ...['ask', 'status', 'result'].flatMap(name => ['-c', `mcp_servers.antigravity.tools.antigravity_${name}.approval_mode="approve"`]), '--json',
  `Perform a local integration smoke test. Use only antigravity MCP tools. Call antigravity_ask exactly once with cwd ${cwd} and prompt: Reply with exactly AGY_CODEX_E2E_OK. Do not use tools or modify files. Poll status then retrieve result. Report exact answer, state, exit code. Do not retry or run shell commands.`];
const child = spawn(codex, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let verified = false;
const lines = createInterface({ input: child.stdout });
lines.on('line', line => {
  let event;
  try { event = JSON.parse(line); } catch { return; }
  const item = event.item;
  if (event.type === 'item.completed' && item?.type === 'mcp_tool_call') {
    if (item.tool === 'antigravity_result' && item.result) {
      const result = item.result.structured_content || JSON.parse(item.result.content[0].text);
      verified = result.state === 'succeeded' && result.exitCode === 0 && result.answer?.trim() === 'AGY_CODEX_E2E_OK';
      console.log(JSON.stringify({ verified, answer: result.answer, state: result.state, exitCode: result.exitCode, durationMs: result.durationMs }));
    } else console.log(JSON.stringify({ tool: item.tool, status: item.status, error: item.error }));
  }
});
// Codex diagnostics go to stderr; provider transcripts are not printed or saved.
child.stderr.pipe(process.stderr);
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
child.on('close', code => {
  process.exitCode = code === 0 && verified ? 0 : 1;
  if (!verified) console.error('No verified Antigravity result. A zero Codex exit code alone is insufficient.');
});

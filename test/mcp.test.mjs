import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline';

test('MCP stdio handshake, tool discovery, async ask/status/result, errors, cancel, shutdown', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'agy-mcp-test-'));
  const config = join(cwd, 'config.json');
  await writeFile(config, JSON.stringify({ executable: process.execPath, executableArgs: [resolve('test/fake-cli.mjs')] }));
  const child = spawn(process.execPath, [resolve('plugins/antigravity-plugin-codex/src/cli.mjs'), 'serve', '--config', config], { stdio: ['pipe', 'pipe', 'pipe'] });
  let stderr = '', serial = 0;
  child.stderr.on('data', data => { stderr += data; });
  const pending = new Map();
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => { const message = JSON.parse(line); pending.get(message.id)?.(message); pending.delete(message.id); });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error('MCP response timeout')); }, 10000);
    pending.set(id, result => { clearTimeout(timer); resolve(result); });
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
  const call = async (name, args) => (await request('tools/call', { name, arguments: args })).result;
  try {
    const init = await request('initialize', { protocolVersion: '2025-06-18', clientInfo: { name: 'test', version: '1' }, capabilities: {} });
    assert.equal(init.result.protocolVersion, '2025-06-18');
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
    const tools = await request('tools/list', {}); assert.equal(tools.result.tools.length, 8);
    const start = (await call('antigravity_ask', { cwd, prompt: 'Привет\nworld' })).structuredContent;
    let status;
    do { await delay(25); status = (await call('antigravity_status', { taskId: start.id })).structuredContent; } while (['starting', 'running', 'finalizing'].includes(status.state));
    const result = (await call('antigravity_result', { taskId: start.id })).structuredContent;
    assert.equal(result.state, 'succeeded'); assert.equal(result.answer, 'Привет\nworld');
    assert.equal((await call('antigravity_ask', { cwd, prompt: 42 })).isError, true);
    assert.equal((await call('antigravity_result', { taskId: 'foreign' })).isError, true);
    assert.equal((await request('unknown', {})).error.code, -32601);
    const sleeping = (await call('antigravity_ask', { cwd, prompt: 'SLEEP' })).structuredContent;
    await call('antigravity_cancel', { taskId: sleeping.id });
    do { await delay(25); status = (await call('antigravity_status', { taskId: sleeping.id })).structuredContent; } while (['starting', 'running', 'finalizing'].includes(status.state));
    assert.equal(status.state, 'cancelled');
    const closed = new Promise(resolve => child.once('close', resolve));
    child.stdin.end(); assert.equal(await closed, 0);
    assert.equal(stderr, '');
  } finally { child.kill(); }
});

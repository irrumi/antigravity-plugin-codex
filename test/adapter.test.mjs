import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, mkdir, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { Adapter } from '../plugins/antigravity-plugin-codex/src/adapter.mjs';
import { configuration, redactor } from '../plugins/antigravity-plugin-codex/src/config.mjs';

const fixture = resolve('test/fake-cli.mjs');
const make = (extra = {}, profile) => new Adapter({ executable: process.execPath, executableArgs: [fixture, ...(profile ? [`profile=${profile}`] : [])], timeoutMs: 10000, ...extra });
const temp = () => mkdtemp(join(tmpdir(), 'agy-test space-'));
const run = (a, prompt, cwd, extra = {}) => a.wait(a.start('ask', { prompt, cwd, ...extra }).id);
async function repo() {
  const cwd = await temp();
  const git = (...args) => execFileSync('git', ['-c', 'core.hooksPath=', '-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  git('init'); git('config', 'user.email', 'test@example.invalid'); git('config', 'user.name', 'Test');
  await writeFile(join(cwd, 'tracked.txt'), 'committed\n'); git('add', '.'); git('commit', '-m', 'fixture');
  return { cwd, git };
}

test('missing executable and unsupported IDE/old CLI fail before task', async () => {
  const missing = make({ executable: join(await temp(), 'missing.exe'), executableArgs: [] });
  assert.equal((await missing.doctor()).error, 'CLI_MISSING');
  assert.equal((await make({}, 'old').doctor()).error, 'UNSUPPORTED_CLI');
  assert.equal((await run(make({}, 'old'), 'hello', await temp())).error.code, 'UNSUPPORTED_CLI');
});
test('doctor does not infer auth; optional real probe is positive evidence', async () => {
  const a = make();
  assert.equal((await a.doctor()).auth, 'unknown');
  assert.equal((await a.doctor({ probeAuth: true })).auth, 'verified');
});
test('authentication failure ends promptly', async () => {
  const result = await run(make(), 'AUTH', await temp());
  assert.equal(result.error.code, 'AUTH_REQUIRED');
  assert.ok(result.durationMs < 6000);
});
test('quotes, shell metacharacters, Unicode, newlines and large prompts roundtrip exactly', async () => {
  const cwd = await temp();
  const text = 'Привет 世界 😀 "quotes" \' & | > $(touch hacked) `cmd` %PATH%\nline\r\n' + 'Ж'.repeat(70000);
  const result = await run(make(), text, cwd);
  assert.equal(result.state, 'succeeded'); assert.equal(result.answer, text);
  assert.notEqual(result.workspace, cwd);
});
test('model uses separate argv; no global settings writes', async () => {
  const cwd = await temp();
  const settings = join(cwd, 'settings.json'); await writeFile(settings, '{"model":"unchanged"}');
  const result = await run(make(), 'INSPECT', cwd, { model: 'test-model' });
  assert.ok(JSON.parse(result.answer).args.includes('test-model'));
  assert.equal(await readFile(settings, 'utf8'), '{"model":"unchanged"}');
  assert.equal((await run(make({}, 'no-model'), 'hello', cwd, { model: 'test-model' })).error.code, 'MODEL_UNSUPPORTED');
});
test('nonzero exit and structured failure preserve response', async () => {
  const result = await run(make(), 'FAIL', await temp());
  assert.equal(result.state, 'failed'); assert.equal(result.exitCode, 7); assert.equal(result.answer, 'Partial');
});
test('zero exit alone is insufficient; malformed/duplicate/missing result fails', async () => {
  for (const prompt of ['EMPTY', 'INVALID', 'DUPLICATE']) assert.equal((await run(make(), prompt, await temp())).error.code, 'INVALID_OUTPUT');
});
test('permission soft denial and waiting are not success', async () => {
  assert.equal((await run(make(), 'DENY', await temp())).state, 'needs_attention');
  assert.equal((await run(make(), 'WAITING', await temp())).error.code, 'PERMISSION_REQUIRED');
});
test('timeout terminates execution', async () => {
  const result = await run(make(), 'SLEEP', await temp(), { timeoutMs: 800 });
  assert.equal(result.state, 'timed_out'); assert.ok(result.durationMs < 6000);
});
test('cancel terminates owned child tree and task is not retried', async () => {
  const a = make(); const start = a.start('ask', { cwd: await temp(), prompt: 'TREE' });
  while (a.status(start.id).state === 'starting') await delay(20);
  await delay(400); a.cancel(start.id);
  const result = await a.wait(start.id);
  assert.equal(result.state, 'cancelled');
  const pid = Number(result.stderr.match(/CHILD_PID=(\d+)/)?.[1]);
  assert.ok(pid, 'fixture must actually spawn a child');
  await delay(100);
  assert.throws(() => process.kill(pid, 0));
});
test('output cap stops producer and bounds captured stdout plus stderr', async () => {
  const result = await run(make({ maxOutputBytes: 1024 }), 'BIG', await temp());
  assert.equal(result.error.code, 'OUTPUT_LIMIT');
  assert.ok(Buffer.byteLength(result.stdout + result.stderr) <= 1024);
});
test('empty diff returns no_changes without requiring CLI', async () => {
  const { cwd } = await repo(); const a = make({ executable: 'nonexistent-agy' });
  assert.equal((await a.wait(a.start('review', { cwd }).id)).state, 'no_changes');
});
test('non-Git path and nonempty strict review report explicit errors', async () => {
  const a = make();
  assert.equal((await a.wait(a.start('review', { cwd: await temp() }).id)).error.code, 'GIT_ERROR');
  const { cwd } = await repo(); await writeFile(join(cwd, 'tracked.txt'), 'dirty\n');
  assert.equal((await a.wait(a.start('review', { cwd }).id)).error.code, 'READ_ONLY_UNAVAILABLE');
});
test('staged, unstaged and base reviews select actual diffs', async () => {
  const { cwd, git } = await repo(); const a = make();
  await writeFile(join(cwd, 'tracked.txt'), 'staged line\n'); git('add', '.');
  await writeFile(join(cwd, 'tracked.txt'), 'unstaged line\n');
  for (const mode of ['staged', 'unstaged', 'base']) {
    const result = await a.wait(a.start('review', { cwd, mode, ...(mode === 'base' ? { base: 'HEAD' } : {}), allowSnapshotWrites: true }).id);
    assert.equal(result.state, 'succeeded'); assert.match(result.answer, mode === 'staged' ? /\+staged line/ : /\+unstaged line/);
    assert.notEqual(result.workspace, cwd);
  }
});
test('parallel delegates get independent clones and preserve dirty source/index/config', async () => {
  const { cwd, git } = await repo();
  await writeFile(join(cwd, 'tracked.txt'), 'user staged\n'); git('add', '.');
  await writeFile(join(cwd, 'tracked.txt'), 'user unstaged\n'); await writeFile(join(cwd, 'user.txt'), 'untracked user\n');
  const before = { status: git('status', '--porcelain'), index: await readFile(join(cwd, '.git', 'index')), config: await readFile(join(cwd, '.git', 'config')) };
  const a = make();
  const ids = [a.start('delegate', { cwd, prompt: 'EDIT one' }).id, a.start('delegate', { cwd, prompt: 'EDIT two' }).id];
  assert.throws(() => a.start('ask', { cwd, prompt: 'hello' }), { code: 'BUSY' });
  const [one, two] = await Promise.all(ids.map(id => a.wait(id)));
  assert.equal(one.state, 'succeeded', JSON.stringify(one)); assert.equal(two.state, 'succeeded', JSON.stringify(two));
  assert.notEqual(one.workspace, two.workspace); assert.match(one.diff, /agent change/); assert.deepEqual(one.untrackedFiles, ['new.txt']);
  assert.equal(await readFile(join(cwd, 'tracked.txt'), 'utf8'), 'user unstaged\n');
  assert.equal(await readFile(join(cwd, 'user.txt'), 'utf8'), 'untracked user\n');
  assert.equal(git('status', '--porcelain'), before.status);
  assert.deepEqual(await readFile(join(cwd, '.git', 'index')), before.index);
  assert.deepEqual(await readFile(join(cwd, '.git', 'config')), before.config);
});
test('explicit context is bounded and cannot escape source directory', async () => {
  const cwd = await temp(); await writeFile(join(cwd, 'контекст.txt'), 'selected context');
  const a = make(); const result = await run(a, 'hello', cwd, { contextFiles: ['контекст.txt'] });
  assert.match(result.answer, /selected context/);
  const outside = await temp(); await writeFile(join(outside, 'secret.txt'), 'secret');
  const { relative } = await import('node:path');
  assert.equal((await run(a, 'hello', cwd, { contextFiles: [relative(cwd, join(outside, 'secret.txt'))] })).error.code, 'CONTEXT_OUTSIDE_ROOT');
  assert.equal((await run(make({ maxInputBytes: 256 }), 'x'.repeat(257), cwd)).error.code, 'INPUT_LIMIT');
});
test('invalid configuration, shell launchers, and foreign task IDs are rejected', () => {
  assert.throws(() => configuration({ executable: 'agy.cmd' }), { code: 'UNSUPPORTED_LAUNCHER' });
  assert.throws(() => configuration({ maxConcurrent: 0 }), { code: 'INVALID_INPUT' });
  assert.throws(() => make().result('not-a-task'), { code: 'TASK_NOT_FOUND' });
});
test('task retention is bounded and forget preserves artifacts', async () => {
  const a = make({ maxTasks: 1 }); const cwd = await temp();
  const result = await run(a, 'hello', cwd);
  assert.throws(() => a.start('ask', { cwd, prompt: 'hello' }), { code: 'TASK_LIMIT' });
  a.forget(result.id); assert.equal(await realpath(result.workspace), result.workspace);
  assert.equal((await run(a, 'again', cwd)).state, 'succeeded');
});
test('known environment secrets and OAuth links are redacted', () => {
  const redact = redactor({ API_KEY: 'super-secret-value' });
  assert.equal(redact('super-secret-value Bearer abcdefgh1234 https://accounts.google.com/auth?code=private'), '[REDACTED] Bearer [REDACTED] [REDACTED OAuth URL]');
});
test('missing Git is distinguished from a non-repository', async () => {
  const cwd = await temp(); const oldPath = process.env.PATH;
  try {
    process.env.PATH = cwd;
    const a = make();
    assert.equal((await a.wait(a.start('review', { cwd }).id)).error.code, 'GIT_MISSING');
  } finally { process.env.PATH = oldPath; }
});
test('server close cancels an active task and refuses new starts', async () => {
  const a = make(); const cwd = await temp();
  const { id } = a.start('ask', { cwd, prompt: 'SLEEP' });
  while (a.status(id).state === 'starting') await delay(20);
  await a.close();
  assert.equal(a.result(id).state, 'cancelled');
  assert.throws(() => a.start('ask', { cwd, prompt: 'hello' }), { code: 'SHUTTING_DOWN' });
});


test('display redaction covers filenames and paths without altering source or workspace patch bytes', async () => {
  const { cwd, git } = await repo();
  const a = make();
  const patchValue = 'SYNTHETIC_ONLY_patch_value';
  const filename = 'SYNTHETIC_ONLY_filename';
  a.redact = redactor({ TEST_API_KEY: patchValue, TEST_SECRET: filename });
  const before = git('diff', 'HEAD');
  const result = await a.wait(a.start('delegate', { cwd, prompt: 'EDIT_SYNTHETIC_REDACTION' }).id);
  assert.equal(result.state, 'succeeded');
  assert.match(result.diff, /\[REDACTED\]/);
  assert.ok(!result.diff.includes(patchValue));
  assert.deepEqual(result.untrackedFiles, ['[REDACTED].txt']);
  assert.equal(await readFile(join(result.workspace, 'tracked.txt'), 'utf8'), patchValue + '\n');
  assert.equal(await readFile(join(result.workspace, filename + '.txt'), 'utf8'), patchValue + '\n');
  assert.match(execFileSync('git', ['-C', result.workspace, 'diff'], { encoding: 'utf8' }), /SYNTHETIC_ONLY_patch_value/);
  assert.equal(git('diff', 'HEAD'), before);
  assert.equal(await readFile(join(cwd, 'tracked.txt'), 'utf8'), 'committed\n');
  // Operational paths are retained privately; every outward task view is masked.
  a.redact = redactor({ TEST_SECRET: result.workspace });
  assert.equal(a.status(result.id).workspace, '[REDACTED]');
  assert.equal(a.result(result.id).workspace, '[REDACTED]');
  assert.equal(a.forget(result.id).workspacePreserved, '[REDACTED]');
});

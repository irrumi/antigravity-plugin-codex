import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Adapter } from '../plugins/antigravity-plugin-codex/src/adapter.mjs';
import { redactor } from '../plugins/antigravity-plugin-codex/src/config.mjs';

// All credentials in this file are deliberately synthetic, never provider data.
const secrets = ['SYNTHETIC_ONLY_line1\nline2', 'SYNTHETIC_ONLY_\\path"quoted"世界😀', 'SYNTHETIC_ONLY_overlap', 'SYNTHETIC_ONLY_overlap_long'];
const env = Object.fromEntries(secrets.map((value, i) => [`TEST_API_KEY_${i}`, value]));
const redact = redactor(env);
const oauth = 'https://accounts.google.com/o/oauth2/auth?synthetic=1';
const resultEvent = (response = 'ok', status = 'SUCCESS', error) => ({ event: 'result', result: { response, status, ...(error === undefined ? {} : { error }) } });
async function invoke(stdout, stderr = '') {
  const program = `process.stdin.resume(); process.stdin.on('end', () => { process.stdout.write(${JSON.stringify(stdout)}); process.stderr.write(${JSON.stringify(stderr)}); });`;
  const adapter = new Adapter({ executable: process.execPath, executableArgs: ['-e', program, '--'], timeoutMs: 5000 });
  adapter.redact = redact;
  return adapter.invoke('synthetic test', await mkdtemp(join(tmpdir(), 'agy-redaction-')), undefined, 5000);
}
function assertSanitized(value) {
  if (typeof value === 'string') for (const secret of secrets) assert.ok(!value.includes(secret), 'synthetic credential must not survive');
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) { assertSanitized(key); assertSanitized(child); }
}

test('exported redactor masks exact synthetic secrets, longest overlaps first, and preserves benign text', () => {
  for (const secret of secrets) assert.equal(redact(secret), '[REDACTED]');
  const benign = 'https://accounts.google.com.example/auth plain \\path "quoted" 世界 😀\nnext';
  assert.equal(redact(benign), benign);
});
test('Adapter.invoke sanitizes OAuth tool reports without corrupting JSON', async () => {
  const event = { event: 'step', step_update: { tool_name: 'run_command', state: 'DONE', tool_info: { url: oauth, exitCode: 0, nested: [null, true, { note: 'benign' }] } } };
  const result = await invoke([event, resultEvent()].map(JSON.stringify).join('\n'));
  assert.equal(result.state, 'succeeded');
  assert.equal(result.checks[0].url, '[REDACTED OAuth URL]');
  assert.equal(result.checks[0].exitCode, 0);
  assert.deepEqual(result.checks[0].nested, [null, true, { note: 'benign' }]);
  assert.equal(JSON.parse(result.stdout.split('\n')[0]).step_update.tool_info.url, '[REDACTED OAuth URL]');
});
test('Adapter.invoke sanitizes decoded leaves in every returned protocol copy and mixed stderr', async () => {
  const text = secrets.join(' | ');
  const events = [{ event: 'step', step_update: { tool_name: 'run_command', state: 'DONE', tool_info: { command: text, nested: [text, { path: text }], exitCode: 0 } } }, resultEvent(text)];
  // Unicode escape spelling differs from JSON.stringify; the protocol parser owns decoding.
  const stdout = events.map(JSON.stringify).join('\n').replaceAll('世界', '\\u4e16\\u754c');
  const stderr = 'ordinary log\n' + JSON.stringify({ detail: text, nested: [text] }) + '\n' + text;
  const result = await invoke(stdout, stderr);
  assert.equal(result.state, 'succeeded');
  assertSanitized(result);
  for (const line of result.stdout.trim().split('\n')) assertSanitized(JSON.parse(line));
  assert.equal(result.stderr, '[Diagnostic omitted: multiline credential]');
  assert.equal(result.answer, secrets.map(() => '[REDACTED]').join(' | '));
});
test('malformed, duplicate and invalid envelopes suppress untrusted stdout without publishing checks', async () => {
  const tool = JSON.stringify({ event: 'step', step_update: { tool_name: 'run_command', state: 'DONE', tool_info: { url: oauth } } });
  const valid = JSON.stringify(resultEvent(secrets[0]));
  for (const stdout of [tool + '\nnot JSON ' + JSON.stringify(secrets[0]), valid + '\n' + valid, JSON.stringify(resultEvent('ok', {})), JSON.stringify(resultEvent('ok', 'ERROR', {})), '[1,2,3]', 'null']) {
    const result = await invoke(stdout);
    assert.equal(result.error.code, 'INVALID_OUTPUT');
    assert.equal(result.stdout, '[CLI stdout omitted: invalid or incomplete protocol]');
    assert.deepEqual(result.checks, []);
    assertSanitized(result);
  }
});
test('failure response, error message and diagnostic JSON are sanitized', async () => {
  const result = await invoke(JSON.stringify(resultEvent(secrets[1], 'ERROR', secrets[0])), JSON.stringify({ error: secrets[1] }));
  assert.equal(result.error.code, 'CLI_FAILED');
  assert.equal(result.error.message, '[REDACTED]');
  assert.equal(result.answer, '[REDACTED]');
  assertSanitized(result);
  assertSanitized(JSON.parse(result.stdout));
});

test('malformed stderr JSON is omitted; benign mixed diagnostics retain their meaning', async () => {
  const result = await invoke(JSON.stringify(resultEvent()), 'plain text\n{"broken":' + JSON.stringify(secrets[0]) + '\n' + JSON.stringify({ text: 'benign \\path "quote" 世界', count: 3 }));
  assert.equal(result.state, 'succeeded');
  assert.equal(result.stderr.split('\n')[0], 'plain text');
  assert.equal(result.stderr.split('\n')[1], '[Malformed JSON diagnostic omitted]');
  assert.deepEqual(JSON.parse(result.stderr.split('\n')[2]), { text: 'benign \\path "quote" 世界', count: 3 });
});
test('deep structures, colliding redacted keys and invalid tool reports fail closed', async () => {
  let deep = 'leaf';
  for (let i = 0; i < 140; i++) deep = [deep];
  for (const tool_info of [{ deep }, { [secrets[2]]: 1, [secrets[3]]: 2 }, 'not an object', null]) {
    const result = await invoke([JSON.stringify({ event: 'step', step_update: { tool_name: 'run_command', state: 'DONE', tool_info } }), JSON.stringify(resultEvent())].join('\n'));
    assert.equal(result.error.code, 'INVALID_OUTPUT');
    assert.equal(result.stdout, '[CLI stdout omitted: invalid or incomplete protocol]');
    assert.deepEqual(result.checks, []);
  }
});
test('prototype-shaped JSON keys remain sanitized data', async () => {
  const event = JSON.parse('{"event":"step","step_update":{"tool_name":"run_command","state":"DONE","tool_info":{"__proto__":{"synthetic":"value"},"exitCode":0}}}');
  const result = await invoke([event, resultEvent()].map(JSON.stringify).join('\n'));
  assert.equal(result.state, 'succeeded');
  assert.ok(Object.hasOwn(result.checks[0], '__proto__'));
  assert.equal(Object.getPrototypeOf(result.checks[0]), Object.prototype);
});


test('multiline stderr secrets crossing JSON line boundaries are omitted', async () => {
  const { diagnosticText } = await import('../plugins/antigravity-plugin-codex/src/sanitize.mjs');
  for (const suffix of ['12345', '{"test":true}', 'null', '"text"']) {
    const secret = 'SYNTHETIC_ONLY_prefix\n' + suffix;
    assert.equal(diagnosticText(secret, redactor({ TEST_SECRET: secret })), '[Diagnostic omitted: multiline credential]');
  }
});
test('protocol decisions use raw validated keys; result retrieval does not redact serialized copies again', async () => {
  const program = `process.stdin.resume(); process.stdin.on('end', () => console.log(JSON.stringify({event:'result',result:{response:'ok',status:'SUCCESS'}})));`;
  const adapter = new Adapter({ executable: process.execPath, executableArgs: ['-e', program, '--'] });
  for (const secret of ['response', '"response"']) {
    adapter.redact = redactor({ TEST_SECRET: secret });
    const result = await adapter.invoke('test', await mkdtemp(join(tmpdir(), 'agy-redaction-')), undefined, 5000);
    assert.equal(result.state, 'succeeded');
    assert.equal(result.answer, 'ok');
    adapter.tasks.set('synthetic-id', { task: { ...result, id: 'synthetic-id', workspace: null }, finished: true });
    const displayed = adapter.result('synthetic-id');
    assert.deepEqual(JSON.parse(displayed.stdout), JSON.parse(result.stdout));
    assert.equal(displayed.answer, 'ok');
    displayed.checks.push({ command: 'caller mutation' });
    assert.deepEqual(adapter.result('synthetic-id').checks, []);
  }
});

import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { existsSync } from 'node:fs';

export class BridgeError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function fail(code, message) { throw new BridgeError(code, message); }
export function integer(value, min, max, name) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_INPUT', `${name} must be an integer between ${min} and ${max}`);
  return value;
}
export function configuration(input = {}) {
  const allowed = ['executable', 'executableArgs', 'timeoutMs', 'maxOutputBytes', 'maxInputBytes', 'maxConcurrent', 'maxTasks'];
  for (const key of Object.keys(input)) if (!allowed.includes(key)) fail('INVALID_CONFIG', `Unknown configuration key: ${key}`);
  const standard = process.platform === 'win32' ? join(process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'), 'agy', 'bin', 'agy.exe') : join(homedir(), '.local', 'bin', 'agy');
  const c = { executable: existsSync(standard) ? standard : 'agy', executableArgs: [], timeoutMs: 300000, maxOutputBytes: 1048576, maxInputBytes: 1048576, maxConcurrent: 2, maxTasks: 100, ...input };
  if (typeof c.executable !== 'string' || !c.executable || c.executable.includes('\0')) fail('INVALID_CONFIG', 'executable must be a native executable or PATH command');
  if (/[\\/]/.test(c.executable) && !isAbsolute(c.executable)) fail('INVALID_CONFIG', 'Executable paths must be absolute');
  if (/\.(cmd|bat|ps1)$/i.test(c.executable)) fail('UNSUPPORTED_LAUNCHER', 'Shell launchers are not supported. Select the native agent executable, or node plus an absolute JS entrypoint in executableArgs.');
  if (!Array.isArray(c.executableArgs) || c.executableArgs.some(x => typeof x !== 'string' || x.includes('\0'))) fail('INVALID_CONFIG', 'executableArgs must be strings');
  integer(c.timeoutMs, 50, 86400000, 'timeoutMs');
  integer(c.maxOutputBytes, 256, 16777216, 'maxOutputBytes');
  integer(c.maxInputBytes, 256, 16777216, 'maxInputBytes');
  integer(c.maxConcurrent, 1, 16, 'maxConcurrent');
  integer(c.maxTasks, 1, 1000, 'maxTasks');
  return c;
}
export async function loadConfiguration(path = process.env.AGY_CODEX_CONFIG) {
  return configuration(path ? JSON.parse(await readFile(path, 'utf8')) : {});
}
// Best-effort defense for known credential values, not a general DLP filter.
export function redactor(env = process.env) {
  const secrets = Object.entries(env).filter(([k, v]) => /token|secret|password|api_?key/i.test(k) && typeof v === 'string' && v.length >= 8).map(([, v]) => v).sort((a, b) => b.length - a.length);
  return value => {
    let text = String(value ?? '');
    for (const secret of secrets) text = text.split(secret).join('[REDACTED]');
    return text.replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]{8,}/gi, '$1[REDACTED]').replace(/https:\/\/accounts\.google\.com\/[^\s]+/g, '[REDACTED OAuth URL]');
  };
}

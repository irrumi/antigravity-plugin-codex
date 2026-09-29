import { realpath, readFile, stat, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, isAbsolute } from 'node:path';
import { runProcess } from './process.mjs';
import { fail } from './config.mjs';

export async function git(cwd, args, { signal, limit = 1048576 } = {}) {
  const r = await runProcess('git', ['-c', 'core.hooksPath=', '-c', 'core.fsmonitor=false', ...args], { cwd, signal, maxOutputBytes: limit, timeoutMs: 60000 });
  if (r.cleanupFailed) fail('CLEANUP_FAILED', 'Git process-tree cleanup could not be confirmed');
  if (r.error === 'ENOENT') fail('GIT_MISSING', 'Git is not installed or not on PATH');
  if (r.reason) fail(r.reason.toUpperCase(), `Git stopped: ${r.reason}`);
  if (r.exitCode !== 0) fail('GIT_ERROR', r.stderr.trim() || 'Git command failed');
  return r.stdout;
}
export async function repository(cwd, options) {
  return (await git(cwd, ['rev-parse', '--show-toplevel'], options)).trim();
}
export async function readDiff(cwd, mode = 'unstaged', base, options) {
  await repository(cwd, options);
  const args = ['diff', '--no-ext-diff', '--no-textconv', '--binary'];
  if (mode === 'staged') args.push('--cached');
  else if (mode === 'base') {
    if (typeof base !== 'string' || !base || base.startsWith('-')) fail('INVALID_INPUT', 'base mode requires a Git revision');
    const oid = (await git(cwd, ['rev-parse', '--verify', '--end-of-options', `${base}^{commit}`], options)).trim();
    args.push(oid);
  } else if (mode !== 'unstaged') fail('INVALID_INPUT', 'diff mode must be staged, unstaged, or base');
  return git(cwd, [...args, '--'], options);
}
export async function isolatedClone(cwd, signal) {
  const root = await repository(cwd, { signal });
  const baseCommit = (await git(root, ['rev-parse', '--verify', 'HEAD'], { signal })).trim();
  const parent = await mkdtemp(join(tmpdir(), 'agy-codex-'));
  const workspace = join(parent, 'work');
  // Independent objects/index/config: no shared Git metadata or user index mutations.
  await git(parent, ['clone', '--no-hardlinks', '--no-checkout', '--', root, workspace], { signal });
  await git(workspace, ['checkout', '--detach', baseCommit], { signal });
  await git(workspace, ['remote', 'remove', 'origin'], { signal });
  return { workspace, baseCommit, parent };
}
export async function contextText(cwd, files = [], limit = 1048576) {
  if (!Array.isArray(files) || files.length > 64) fail('INVALID_INPUT', 'contextFiles must be an array of at most 64 relative files');
  const root = await realpath(cwd);
  let text = '';
  for (const file of files) {
    if (typeof file !== 'string' || isAbsolute(file)) fail('INVALID_INPUT', 'Context paths must be relative to cwd');
    const path = await realpath(join(root, file));
    const rel = relative(root, path);
    if (rel === '..' || rel.startsWith(`..${process.platform === 'win32' ? '\\' : '/'}`) || isAbsolute(rel) || rel.split(/[\\/]/).includes('.git')) fail('CONTEXT_OUTSIDE_ROOT', 'Context path escapes cwd or enters .git');
    const info = await stat(path);
    if (!info.isFile() || info.size > limit) fail('INPUT_LIMIT', 'Context file is not a bounded regular file');
    const content = await readFile(path, 'utf8');
    if (content.includes('\0')) fail('INVALID_INPUT', 'Binary context is not supported');
    text += `\n\nContext file ${JSON.stringify(file)}:\n${content}`;
    if (Buffer.byteLength(text) > limit) fail('INPUT_LIMIT', 'Combined context is too large');
  }
  return text;
}
export async function changes(workspace, baseCommit, limit) {
  const diff = await git(workspace, ['diff', '--no-ext-diff', '--no-textconv', '--binary', baseCommit, '--'], { limit });
  const changedFiles = (await git(workspace, ['diff', '--name-only', '-z', baseCommit, '--'], { limit })).split('\0').filter(Boolean);
  const untrackedFiles = (await git(workspace, ['ls-files', '--others', '--exclude-standard', '-z'], { limit })).split('\0').filter(Boolean);
  // New files stay in the preserved workspace; avoid modifying its index for reporting.
  return { diff, changedFiles, untrackedFiles };
}

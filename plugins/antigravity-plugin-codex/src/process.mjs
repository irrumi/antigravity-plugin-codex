import { spawn } from 'node:child_process';
import { join } from 'node:path';

export function runProcess(executable, args, { cwd, input = '', timeoutMs = 10000, maxOutputBytes = 1048576, signal, env = process.env, detectInteractive = false } = {}) {
  return new Promise(resolve => {
    const start = Date.now();
    let child, reason = null, settled = false, total = 0, timer, killTimer, termination, cleanupFailed = false, stopTimer;
    const buffers = { stdout: [], stderr: [] };
    const finish = async (exitCode, error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer); clearTimeout(killTimer); clearTimeout(stopTimer);
      signal?.removeEventListener('abort', abort);
      if (termination) await termination;
      // On POSIX the process group remains addressable if the leader exited first.
      if (process.platform !== 'win32' && child?.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ }
      }
      resolve({ stdout: Buffer.concat(buffers.stdout).toString('utf8'), stderr: Buffer.concat(buffers.stderr).toString('utf8'), exitCode, error, reason, cleanupFailed, durationMs: Date.now() - start });
    };
    const stop = why => {
      if (settled || reason) return;
      reason = why;
      if (!child?.pid) return;
      if (process.platform === 'win32') {
        termination = new Promise(done => {
          const killer = spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { shell: false, windowsHide: true, stdio: 'ignore' });
          const watchdog = setTimeout(() => { cleanupFailed = true; killer.kill(); child.kill(); done(); }, 2000);
          killer.once('error', () => { clearTimeout(watchdog); cleanupFailed = true; child.kill(); done(); });
          killer.once('close', code => { clearTimeout(watchdog); if (code !== 0) { cleanupFailed = true; child.kill(); } done(); });
        });
      } else {
        try { process.kill(-child.pid, 'SIGTERM'); } catch { /* already gone */ }
        killTimer = setTimeout(() => { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* already gone */ } }, 300);
      }
      stopTimer = setTimeout(() => {
        cleanupFailed = true;
        child.stdout.destroy(); child.stderr.destroy(); child.stdin.destroy(); child.unref();
        void finish(child.exitCode, 'CLEANUP_FAILED');
      }, 3000);
    };
    const abort = () => stop('cancelled');
    if (signal?.aborted) { reason = 'cancelled'; void finish(null); return; }
    try {
      child = spawn(executable, args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (error) { void finish(null, error.code || 'SPAWN_FAILED'); return; }
    for (const name of ['stdout', 'stderr']) child[name].on('data', data => {
      const remaining = Math.max(0, maxOutputBytes - total);
      if (remaining) buffers[name].push(data.subarray(0, remaining));
      total += data.length;
      if (total > maxOutputBytes) stop('output_limit');
      if (detectInteractive && name === 'stderr') {
        const text = Buffer.concat(buffers.stderr).toString('utf8');
        if (/authentication required|not authenticated|not logged into|login required|triggering interactive OAuth/i.test(text)) stop('auth_required');
        else if (/paste.*authorization code|waiting for.*approval|press enter to continue/i.test(text)) stop('permission_required');
      }
    });
    child.once('error', error => { void finish(null, error.code || 'SPAWN_FAILED'); });
    child.once('close', code => { void finish(code); });
    // Do not hang on inherited pipes after a POSIX leader has exited.
    child.once('exit', () => {
      if (process.platform !== 'win32' && child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group empty */ }
      }
    });
    child.stdin.on('error', () => { /* EPIPE is reported by the exit/result checks. */ });
    signal?.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => stop('timed_out'), timeoutMs);
    child.stdin.end(input, 'utf8');
  });
}

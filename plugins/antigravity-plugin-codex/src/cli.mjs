#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { loadConfiguration } from './config.mjs';
import { Adapter } from './adapter.mjs';
import { serve } from './server.mjs';

async function main() {
  const args = process.argv.slice(2);
  if (!args.length || args.includes('--help')) {
    console.log('Usage: node cli.mjs doctor [--probe-auth] [--config FILE]\n       node cli.mjs ask|delegate|review --request FILE [--config FILE]\n       node cli.mjs serve [--config FILE]\nRequest JSON: {"cwd":"/absolute/project","prompt":"task","contextFiles":[]}\nAsync start/status/result/cancel/forget are MCP tools in the same server session.');
    return;
  }
  const command = args.shift();
  const options = {};
  while (args.length) {
    const key = args.shift();
    if (key === '--probe-auth') options.probeAuth = true;
    else if (['--config', '--request'].includes(key) && args.length) options[key.slice(2)] = args.shift();
    else throw new Error(`Unknown or incomplete option: ${key}`);
  }
  const config = await loadConfiguration(options.config);
  if (command === 'serve') {
    const server = serve(config);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void server.close().then(() => process.exit(0)); });
    return;
  }
  const adapter = new Adapter(config);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { void adapter.close(); });
  try {
    let result;
    if (command === 'doctor') result = await adapter.doctor({ probeAuth: options.probeAuth });
    else if (['ask', 'delegate', 'review'].includes(command)) {
      if (!options.request) throw new Error('--request FILE is required (prompt is never interpolated through a shell)');
      const request = JSON.parse(await readFile(options.request, 'utf8'));
      result = await adapter.wait(adapter.start(command, request).id);
    } else throw new Error('Unknown command');
    console.log(JSON.stringify(result, null, 2));
    if (result.error || result.supported === false || options.probeAuth && result.auth !== 'verified') process.exitCode = 1;
  } finally { await adapter.close(); }
}
main().catch(error => { console.error(JSON.stringify({ error: { code: error.code || 'ERROR', message: error.message } })); process.exitCode = 1; });

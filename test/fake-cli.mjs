import { readFile, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

const args = process.argv.slice(2);
const profile = args[0]?.startsWith('profile=') ? args.shift().slice(8) : 'normal';
if (args.includes('--version')) { console.log(profile === 'old' ? '0.0.1' : '1.2.13-fake'); process.exit(0); }
if (args.includes('--help')) {
  console.log(profile === 'old' ? '--open --new-window' : '--print --input-format stream-json --output-format stream-json --sandbox --disable-slash-commands' + (profile === 'no-model' ? '' : ' --model'));
  process.exit(0);
}
let raw = '';
for await (const chunk of process.stdin) raw += chunk;
const prompt = JSON.parse(raw).message.content;
const send = (response, status = 'SUCCESS', error) => console.log(JSON.stringify({ event: 'result', result: { status, response, error } }));
if (!args.includes('--sandbox') || args.includes('--dangerously-skip-permissions')) throw new Error('Unsafe invocation');
if (!args.includes('--disable-slash-commands')) throw new Error('Slash expansion should be disabled when supported');
if (prompt === 'AUTH') { console.error('authentication required'); await delay(10000); process.exit(1); }
if (prompt === 'FAIL') { send('Partial', 'ERROR', 'synthetic error'); process.exit(7); }
if (prompt === 'EMPTY') process.exit(0);
if (prompt === 'INVALID') { console.log('not JSON'); process.exit(0); }
if (prompt === 'DUPLICATE') { send('one'); send('two'); process.exit(0); }
if (prompt === 'WAITING') { send('', 'WAITING'); process.exit(0); }
if (prompt === 'DENY') { console.error('Tool permission denied'); send('Could not run tests'); process.exit(0); }
if (prompt === 'BIG') { console.log('x'.repeat(2000000)); await delay(10000); process.exit(0); }
if (prompt === 'SLEEP') await delay(10000);
if (prompt === 'TREE') {
  const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
  console.error(`CHILD_PID=${child.pid}`);
  await delay(10000);
}
if (prompt === 'EDIT_SYNTHETIC_REDACTION') {
  await writeFile('tracked.txt', 'SYNTHETIC_ONLY_patch_value\n');
  await writeFile('SYNTHETIC_ONLY_filename.txt', 'SYNTHETIC_ONLY_patch_value\n');
  send('Edited synthetic artifacts');
} else if (prompt.startsWith('EDIT')) {
  await writeFile('tracked.txt', 'agent change\n');
  await writeFile('new.txt', 'new file\n');
  send('Edited files');
} else if (prompt.startsWith('Reply with exactly AGY_CODEX_OK')) send('AGY_CODEX_OK');
else if (prompt === 'INSPECT') send(JSON.stringify({ cwd: process.cwd(), args }));
else send(prompt);

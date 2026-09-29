import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';

async function walk(path) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const file = join(path, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.name.endsWith('.mjs')) execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
    else if (entry.name.endsWith('.json')) JSON.parse(await readFile(file, 'utf8'));
  }
}
for (const dir of ['plugins', 'scripts', 'test', 'examples', '.agents']) await walk(dir);
const root = resolve('plugins/antigravity-plugin-codex');
const manifest = JSON.parse(await readFile(join(root, '.codex-plugin/plugin.json'), 'utf8'));
assert.equal(manifest.name, 'antigravity-plugin-codex');
assert.equal(manifest.mcpServers, './.mcp.json');
const skill = await readFile(join(root, 'skills/antigravity/SKILL.md'), 'utf8');
assert.ok(skill.startsWith('---\nname: antigravity\n'));
assert.ok(!JSON.stringify(manifest).includes('[TODO:'));
console.log('Syntax, JSON, plugin paths and skill frontmatter checked.');

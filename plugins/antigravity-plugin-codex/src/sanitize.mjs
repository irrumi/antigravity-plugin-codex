import { fail } from './config.mjs';

const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);

// JSON-shaped display copies only. Never mutate protocol input or filesystem data.
export function sanitize(value, redact, depth = 0) {
  if (depth > 128) fail('INVALID_OUTPUT', 'Output nesting exceeds the display limit');
  if (typeof value === 'string') return redact(value);
  if (Array.isArray(value)) return value.map(item => sanitize(item, redact, depth + 1));
  if (!object(value)) return value;
  const result = {};
  for (const [key, child] of Object.entries(value)) {
    const name = redact(key);
    if (Object.hasOwn(result, name)) fail('INVALID_OUTPUT', 'Redacted output names collide');
    // defineProperty treats __proto__ as data, never as a prototype setter.
    Object.defineProperty(result, name, { value: sanitize(child, redact, depth + 1), enumerable: true, configurable: true, writable: true });
  }
  return result;
}

export function protocolEvents(stdout) {
  const events = stdout.split(/\r?\n/).filter(line => line.trim()).map(line => JSON.parse(line));
  if (events.some(event => !object(event) || typeof event.event !== 'string')) fail('INVALID_OUTPUT', 'Invalid event');
  const results = events.filter(event => event.event === 'result');
  const envelope = results[0]?.result;
  if (results.length !== 1 || !object(envelope) || typeof envelope.response !== 'string' || typeof envelope.status !== 'string' || !envelope.status || (envelope.error !== undefined && typeof envelope.error !== 'string')) fail('INVALID_OUTPUT', 'Invalid result envelope');
  for (const event of events) {
    if (event.step_update === undefined) continue;
    const step = event.step_update;
    if (!object(step) || (step.tool_info !== undefined && !object(step.tool_info))) fail('INVALID_OUTPUT', 'Invalid step envelope');
  }
  return events;
}

// Stderr is explicitly mixed text / single-line JSON, not another protocol.
// Parse recognized JSON lines once; do not recursively decode string contents.
export function diagnosticText(text, redact) {
  // A multiline exact match may cross text/JSON line boundaries. Omit rather
  // than split that credential or parse text after replacing structural bytes.
  if (redact(text).split('\n').length !== text.split('\n').length) return '[Diagnostic omitted: multiline credential]';
  const output = [];
  let plain = [];
  const flush = () => { if (plain.length) { output.push(redact(plain.join('\n'))); plain = []; } };
  for (const line of text.split('\n')) {
    let value;
    try { value = JSON.parse(line); }
    catch {
      if (/^\s*[\[{"]/.test(line)) { flush(); output.push('[Malformed JSON diagnostic omitted]'); }
      else plain.push(line);
      continue;
    }
    flush();
    try { output.push(JSON.stringify(sanitize(value, redact))); }
    catch { output.push('[JSON diagnostic omitted: unsafe display structure]'); }
  }
  flush();
  return output.join('\n');
}

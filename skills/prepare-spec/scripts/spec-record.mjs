#!/usr/bin/env node
/**
 * Node 18+. Check a spec without changing it, or stamp an approved document.
 *   node scripts/spec-record.mjs check FILE
 *   node scripts/spec-record.mjs stamp FILE --revision N --approved-by WHO
 *       --approved-at ISO8601Z --base-sha SHA [--branch NAME]
 * Writes JSON {spec_sha256, record, hash_matches} to stdout. Exits 2 for
 * invalid arguments, 1 for file errors. A changed or absent record is data.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

function invalid(message) {
  console.error(message);
  process.exit(2);
}

const [command, file, ...args] = process.argv.slice(2);
if (!['check', 'stamp'].includes(command) || !file || file.startsWith('--')) {
  invalid('Expected check FILE or stamp FILE with approval options.');
}

const options = new Map();
const required = ['--revision', '--approved-by', '--approved-at', '--base-sha'];
const allowed = [...required, '--branch'];
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  const value = args[i + 1];
  if (command !== 'stamp' || !allowed.includes(key) || options.has(key)) {
    invalid(`Unexpected option: ${key}`);
  }
  if (value === undefined || value.startsWith('--') || /[\r\n]|-->/.test(value)) {
    invalid(`Invalid or missing value for ${key}`);
  }
  options.set(key, value);
}

function utcTimestamp(value) {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?Z$/.exec(value);
  if (!match) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 19) === match[1];
}

if (command === 'stamp') {
  for (const key of required) {
    if (!options.get(key)?.trim()) invalid(`Missing value for ${key}`);
  }
  const revision = options.get('--revision');
  if (!/^[1-9]\d*$/.test(revision) || !Number.isSafeInteger(Number(revision))) {
    invalid('Revision must be a positive integer.');
  }
  if (!utcTimestamp(options.get('--approved-at'))) invalid('Expected a UTC ISO 8601 timestamp ending in Z.');
}

function inspect(source) {
  const lines = source.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
  const block = /^\s*<!-- spec-record\n([\s\S]*?)-->/u.exec(lines);
  const body = lines.slice(block?.[0].length ?? 0).replace(/^\n+|\n+$/g, '') + '\n';
  const hash = createHash('sha256').update(body).digest('hex');
  let record = null;
  if (block) {
    const fields = block[1].split('\n').filter(Boolean).map(line => {
      const colon = line.indexOf(':');
      return [line.slice(0, colon), line.slice(colon + 1).trim()];
    });
    record = Object.fromEntries(fields);
  }
  return { body, result: { spec_sha256: hash, record, hash_matches: record && record.spec_sha256 === hash } };
}

try {
  let { body, result } = inspect(readFileSync(file, 'utf8'));
  if (command === 'stamp') {
    const fields = ['status: approved'];
    for (const key of allowed) {
      if (options.has(key)) fields.push(`${key.slice(2).replaceAll('-', '_')}: ${options.get(key)}`);
    }
    fields.push(`spec_sha256: ${result.spec_sha256}`);
    writeFileSync(file, `<!-- spec-record\n${fields.join('\n')}\n-->\n\n${body}`, 'utf8');
    result = inspect(readFileSync(file, 'utf8')).result;
  }
  console.log(JSON.stringify(result));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

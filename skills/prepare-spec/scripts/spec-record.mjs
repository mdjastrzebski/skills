#!/usr/bin/env node
/**
 * Node 18+. Check, stamp, pin, or read the build marker of a spec document.
 *   node scripts/spec-record.mjs check FILE
 *   node scripts/spec-record.mjs stamp FILE --revision N --approved-by WHO
 *       --approved-at ISO8601Z --base-sha SHA [--branch NAME]
 *   node scripts/spec-record.mjs pin FILE --out DIR [--format legacy]
 *   node scripts/spec-record.mjs built FILE
 * check/stamp write JSON {spec_sha256, record, hash_matches} to stdout.
 * pin verifies an approved, hash-matching document and splits it into
 * DIR/document.md, summary.md, full-spec.md and record.json, printing
 * {"status":"ok",...} or {"status":"escalate","reason":...} (writing nothing).
 * Legacy format saves the entire approved body as the full spec, without
 * splitting a summary or extracting structured metadata.
 * built reads the `spec-built` block from a saved PR description.
 * Exits 2 for invalid arguments, 1 for file errors. A changed or absent
 * record, or a document pin/built cannot verify, is data, not an error.
 * Tests: node scripts/spec-record.test.mjs
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

function invalid(message) {
  console.error(message);
  process.exit(2);
}

const commands = ['check', 'stamp', 'pin', 'built'];
const [command, file, ...args] = process.argv.slice(2);
if (!commands.includes(command) || !file || file.startsWith('--')) {
  invalid('Expected check FILE, stamp FILE with approval options, pin FILE --out DIR, or built FILE.');
}

const options = new Map();
const required = { stamp: ['--revision', '--approved-by', '--approved-at', '--base-sha'], pin: ['--out'] };
const allowed = { stamp: [...required.stamp, '--branch'], pin: [...required.pin, '--format'], check: [], built: [] };
for (let i = 0; i < args.length; i += 2) {
  const key = args[i];
  const value = args[i + 1];
  if (!allowed[command].includes(key) || options.has(key)) {
    invalid(`Unexpected option: ${key}`);
  }
  if (value === undefined || value.startsWith('--') || /[\r\n]|-->/.test(value)) {
    invalid(`Invalid or missing value for ${key}`);
  }
  options.set(key, value);
}
for (const key of required[command] ?? []) {
  if (!options.get(key)?.trim()) invalid(`Missing value for ${key}`);
}

function utcTimestamp(value) {
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.\d+)?Z$/.exec(value);
  if (!match) return false;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 19) === match[1];
}

function validRevision(value) {
  return /^[1-9]\d*$/.test(value) && Number.isSafeInteger(Number(value));
}

if (command === 'stamp') {
  if (!validRevision(options.get('--revision'))) {
    invalid('Revision must be a positive integer.');
  }
  if (!utcTimestamp(options.get('--approved-at'))) invalid('Expected a UTC ISO 8601 timestamp ending in Z.');
}

const outputs = { document: 'document.md', summary: 'summary.md', full_spec: 'full-spec.md', record: 'record.json' };
const legacyFormat = options.get('--format') === 'legacy';
if (command === 'pin') {
  if (options.has('--format') && !legacyFormat) invalid('Expected --format legacy.');
  const out = options.get('--out');
  for (const name of Object.values(outputs)) {
    if (existsSync(path.join(out, name))) invalid(`Refusing to overwrite ${path.join(out, name)}`);
  }
}

function normalize(source) {
  return source.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

function documentBody(text) {
  return text.replace(/^\n+|\n+$/g, '') + '\n';
}

function inspect(source) {
  const lines = normalize(source);
  const block = /^\s*<!-- spec-record\n([\s\S]*?)-->/u.exec(lines);
  const body = documentBody(lines.slice(block?.[0].length ?? 0));
  const hash = sha256(body);
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

class Escalate extends Error {
  constructor(reason, detail = '') {
    super(detail || reason);
    this.reason = reason;
    this.detail = detail;
  }
}

// Mark each line as top level or inside a fenced code block (CommonMark ``` / ~~~ fences).
// Fence opening and closing lines are reported with their info string.
function scanLines(text) {
  const lines = text.split('\n');
  const marks = [];
  let fence = null;
  for (const line of lines) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (match && match[1][0] === fence.char && match[1].length >= fence.length && !match[2].trim()) {
        marks.push({ line, kind: 'close', fence });
        fence = null;
      } else {
        marks.push({ line, kind: 'inside', fence });
      }
    } else if (match && !(match[1][0] === '`' && match[2].includes('`'))) {
      fence = { char: match[1][0], length: match[1].length, info: match[2].trim(), start: marks.length };
      marks.push({ line, kind: 'open', fence });
    } else {
      marks.push({ line, kind: 'top' });
    }
  }
  return marks;
}

function topIndexes(marks, predicate, from = 0, to = marks.length) {
  const found = [];
  for (let i = from; i < to; i++) {
    if (marks[i].kind === 'top' && predicate(marks[i].line)) found.push(i);
  }
  return found;
}

// Fenced blocks with the given info string at top level, as {start, end, content}.
function namedFences(marks, info, from = 0, to = marks.length) {
  const blocks = [];
  for (let i = from; i < to; i++) {
    if (marks[i].kind !== 'open' || marks[i].fence.info.split(/\s+/)[0] !== info) continue;
    let end = i + 1;
    while (end < marks.length && marks[end].kind !== 'close') end++;
    if (end >= marks.length) throw new Escalate(`${info}_invalid`, `unclosed ${info} fence`);
    blocks.push({ start: i, end, content: marks.slice(i + 1, end).map(mark => mark.line) });
  }
  return blocks;
}

// Index of the `</details>` that closes the `<details>` at `start`, counting nesting at top level.
function closingDetails(marks, start) {
  let depth = 0;
  for (let i = start; i < marks.length; i++) {
    if (marks[i].kind !== 'top') continue;
    const line = marks[i].line.trim();
    if (line === '<details>' || line.startsWith('<details ')) depth++;
    if (line === '</details>' && --depth === 0) return i;
  }
  return -1;
}

// Track HTML details nesting outside fenced blocks, so embedded documents do not
// contribute outer headings or build markers.
function detailsDepths(marks) {
  let depth = 0;
  return marks.map(mark => {
    const current = depth;
    if (mark.kind === 'top') {
      const line = mark.line.trim();
      if (line === '<details>' || line.startsWith('<details ')) depth++;
      else if (line === '</details>') depth = Math.max(0, depth - 1);
    }
    return current;
  });
}

function trimBlank(lines) {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start].trim()) start++;
  while (end > start && !lines[end - 1].trim()) end--;
  return lines.slice(start, end);
}

function parseKeyValues(lines, reason) {
  const fields = new Map();
  let list = null;
  lines.forEach((raw, index) => {
    const where = `line ${index + 1}`;
    if (!raw.trim()) return;
    const item = /^ {2}- (.+)$/.exec(raw);
    if (item) {
      if (!list) throw new Escalate(reason, `${where}: list item outside a list key`);
      list.push(item[1].trim());
      return;
    }
    const pair = /^([a-z][a-z0-9_]*):(?:\s+(.*))?$/.exec(raw);
    if (!pair) throw new Escalate(reason, `${where}: expected "key: value"`);
    const [, key, rest = ''] = pair;
    if (fields.has(key)) throw new Escalate(reason, `${where}: duplicate key ${key}`);
    const comment = /\s#\s?(.*)$/.exec(rest);
    const value = (comment ? rest.slice(0, comment.index) : rest).trim();
    if (!value) {
      list = [];
      fields.set(key, { list, comment: comment?.[1] ?? null });
    } else {
      list = null;
      fields.set(key, { value, comment: comment?.[1]?.trim() ?? null });
    }
  });
  return fields;
}

function requireKeys(fields, keys, reason) {
  for (const key of fields.keys()) {
    if (!keys.includes(key)) throw new Escalate(reason, `unknown key ${key}`);
  }
}

function parseMeta(lines) {
  const reason = 'meta_invalid';
  const fields = parseKeyValues(lines, reason);
  const keys = ['difficulty', 'builder', 'override', 'scope'];
  requireKeys(fields, keys, reason);
  for (const key of keys) {
    if (!fields.has(key)) throw new Escalate(reason, `missing key ${key}`);
  }
  const scalar = key => {
    const field = fields.get(key);
    if (field.value === undefined) throw new Escalate(reason, `${key} must have a value`);
    return field.value;
  };
  const difficulty = scalar('difficulty');
  if (!['simple', 'moderate', 'hard'].includes(difficulty)) throw new Escalate(reason, `bad difficulty ${difficulty}`);
  const builder = /^([A-Za-z0-9._-]+)\/(low|medium|high|xhigh|max|ultra)$/.exec(scalar('builder'));
  if (!builder) throw new Escalate(reason, 'builder must be model/effort with a supported effort');
  const override = scalar('override');
  if (['xhigh', 'max', 'ultra'].includes(builder[2]) && override === 'none') {
    throw new Escalate(reason, 'effort above high requires a user override');
  }
  const scope = fields.get('scope').list;
  if (!scope?.length) throw new Escalate(reason, 'scope must list at least one path');
  const seen = new Set();
  for (const entry of scope) {
    if (entry.startsWith('/') || entry.split('/').includes('..') || /[*?[\]{}\\]/.test(entry) || entry.includes('//')) {
      throw new Escalate(reason, `invalid scope path ${entry}`);
    }
    if (seen.has(entry)) throw new Escalate(reason, `duplicate scope path ${entry}`);
    seen.add(entry);
  }
  return {
    difficulty,
    difficulty_signals: fields.get('difficulty').comment,
    builder_model: builder[1],
    builder_effort: builder[2],
    override,
    scope,
  };
}

function splitDocument(body) {
  const marks = scanLines(body.replace(/\n$/, ''));
  if (!/^# Spec: .+$/.test(marks[0]?.line ?? '') || marks[0].kind !== 'top') throw new Escalate('missing_title');
  const depths = detailsDepths(marks);
  const summaryStart = topIndexes(marks, line => line === '## Summary').find(i => depths[i] === 0);
  if (summaryStart === undefined) throw new Escalate('summary_heading', 'found no outer Summary heading');
  const detailsStarts = topIndexes(marks, line => line.trim() === '<details>', summaryStart)
    .filter(i => depths[i] === 0 && marks[i + 1]?.kind === 'top' && marks[i + 1].line.trim() === '<summary>Full spec</summary>');
  const headingStarts = topIndexes(marks, line => line === '## Full spec', summaryStart).filter(i => depths[i] === 0);
  if (detailsStarts.length + headingStarts.length === 0) throw new Escalate('full_spec_missing');
  if (detailsStarts.length + headingStarts.length > 1) throw new Escalate('full_spec_ambiguous');
  let fullStart;
  let content;
  if (detailsStarts.length) {
    fullStart = detailsStarts[0];
    const close = closingDetails(marks, fullStart);
    const lastLine = marks.map(mark => mark.line).findLastIndex(line => line.trim());
    if (close < 0 || close !== lastLine) throw new Escalate('full_spec_missing', 'the Full spec <details> must close at the end of the document');
    content = marks.slice(fullStart + 2, close).map(mark => mark.line);
  } else {
    fullStart = headingStarts[0];
    content = marks.slice(fullStart + 1).map(mark => mark.line);
  }
  const summaries = topIndexes(marks, line => line === '## Summary', 0, fullStart).filter(i => depths[i] === 0);
  if (summaries.length !== 1) throw new Escalate('summary_heading', `found ${summaries.length} outer Summary headings`);
  content = trimBlank(content);
  if (!content.length) throw new Escalate('full_spec_empty');
  const metas = namedFences(marks, 'spec-meta', summaryStart + 1, fullStart);
  if (namedFences(marks, 'spec-meta', 0, summaryStart).length || namedFences(marks, 'spec-meta', fullStart).length) {
    throw new Escalate('meta_outside_summary');
  }
  if (metas.length === 0) throw new Escalate('meta_missing');
  if (metas.length > 1) throw new Escalate('meta_multiple');
  const summary = trimBlank(marks.slice(summaryStart + 1, fullStart).map(mark => mark.line));
  const title = marks[0].line;
  return {
    meta: parseMeta(metas[0].content),
    summary: `${title}\n\n## Summary\n\n${summary.join('\n')}\n`,
    fullSpec: `${title}\n\n${content.join('\n')}\n`,
  };
}

function pin(source, out, legacy) {
  const { body, result } = inspect(source);
  const approval = result.record;
  if (!approval) throw new Escalate('missing_record');
  if (approval.status !== 'approved') throw new Escalate('not_approved');
  if (!result.hash_matches) throw new Escalate('hash_mismatch');
  if (!validRevision(approval.revision)) throw new Escalate('record_invalid', 'revision must be a positive integer');
  if (!approval.approved_by) throw new Escalate('record_invalid', 'approved_by is required');
  if (!utcTimestamp(approval.approved_at)) throw new Escalate('record_invalid', 'approved_at must be a UTC ISO 8601 timestamp');
  if (!approval.base_sha) throw new Escalate('record_invalid', 'base_sha is required');
  const { meta, summary, fullSpec } = legacy ? { meta: null, fullSpec: body } : splitDocument(body);
  const contents = { document: body, summary, full_spec: fullSpec };
  const files = {};
  const fileSha256 = {};
  const record = {
    record: approval,
    spec_sha256: result.spec_sha256,
    meta,
    file_sha256: fileSha256,
  };
  mkdirSync(out, { recursive: true });
  for (const [key, content] of Object.entries(contents)) {
    if (content === undefined) continue;
    files[key] = path.join(out, outputs[key]);
    fileSha256[key] = sha256(content);
    writeFileSync(files[key], content, 'utf8');
  }
  files.record = path.join(out, outputs.record);
  writeFileSync(files.record, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  return { status: 'ok', spec_sha256: result.spec_sha256, record: approval, meta, files };
}

function built(source) {
  const marks = scanLines(normalize(source));
  const depths = detailsDepths(marks);
  const blocks = namedFences(marks, 'spec-built').filter(block => depths[block.start] === 0);
  if (blocks.length === 0) {
    if (topIndexes(marks, line => /^## Spec rev \d+\b/.test(line)).length) throw new Escalate('legacy_section');
    throw new Escalate('built_missing');
  }
  if (blocks.length > 1) throw new Escalate('built_multiple');
  const reason = 'built_invalid';
  const fields = parseKeyValues(blocks[0].content, reason);
  requireKeys(fields, ['issue', 'source', 'branch', 'revision', 'spec_sha256'], reason);
  const value = key => fields.get(key)?.value;
  for (const [key, field] of fields) {
    if (field.value === undefined) throw new Escalate(reason, `${key} must have a value`);
  }
  if (fields.has('issue') === fields.has('source')) throw new Escalate(reason, 'need exactly one of issue or source');
  if (fields.has('issue') && !/^#[1-9]\d*$/.test(value('issue'))) throw new Escalate(reason, 'issue must be #N');
  if (fields.has('source') && value('source') !== 'SPEC.md') throw new Escalate(reason, 'source must be SPEC.md');
  if (fields.has('source') !== fields.has('branch')) throw new Escalate(reason, 'branch goes with source, not issue');
  if (!/^[1-9]\d*$/.test(value('revision') ?? '')) throw new Escalate(reason, 'revision must be a positive integer');
  if (!/^[0-9a-f]{64}$/.test(value('spec_sha256') ?? '')) throw new Escalate(reason, 'spec_sha256 must be 64 lowercase hex');
  const result = { revision: Number(value('revision')), spec_sha256: value('spec_sha256') };
  if (fields.has('issue')) {
    result.issue = Number(value('issue').slice(1));
  } else {
    result.source = 'SPEC.md';
    result.branch = value('branch');
    const start = topIndexes(marks, line => line.trim() === '<details>', blocks[0].end)
      .find(i => marks[i + 1]?.kind === 'top' && marks[i + 1].line.trim() === '<summary>Spec</summary>');
    const close = start === undefined ? -1 : closingDetails(marks, start);
    if (close < 0) throw new Escalate('built_document_missing');
    const document = documentBody(marks.slice(start + 2, close).map(mark => mark.line).join('\n'));
    if (sha256(document) !== result.spec_sha256) throw new Escalate('built_hash_mismatch');
    result.document_sha256 = sha256(document);
  }
  return { status: 'ok', built: result };
}

try {
  const source = readFileSync(file, 'utf8');
  if (command === 'pin' || command === 'built') {
    let result;
    try {
      result = command === 'pin' ? pin(source, options.get('--out'), legacyFormat) : built(source);
    } catch (error) {
      if (!(error instanceof Escalate)) throw error;
      result = { status: 'escalate', reason: error.reason, detail: error.detail };
    }
    console.log(JSON.stringify(result));
  } else {
    let { body, result } = inspect(source);
    if (command === 'stamp') {
      const fields = ['status: approved'];
      for (const key of allowed.stamp) {
        if (options.has(key)) fields.push(`${key.slice(2).replaceAll('-', '_')}: ${options.get(key)}`);
      }
      fields.push(`spec_sha256: ${result.spec_sha256}`);
      writeFileSync(file, `<!-- spec-record\n${fields.join('\n')}\n-->\n\n${body}`, 'utf8');
      result = inspect(readFileSync(file, 'utf8')).result;
    }
    console.log(JSON.stringify(result));
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}

#!/usr/bin/env node
// Node 18+. Sample-based checks for spec-record.mjs: node scripts/spec-record.test.mjs
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const script = path.join(path.dirname(fileURLToPath(import.meta.url)), 'spec-record.mjs');
const dir = mkdtempSync(path.join(tmpdir(), 'spec-record-'));
let count = 0;

function run(...args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });
  return { code: result.status, json: result.stdout ? JSON.parse(result.stdout) : null, stderr: result.stderr };
}

function write(text) {
  const file = path.join(dir, `doc-${++count}.md`);
  writeFileSync(file, text, 'utf8');
  return file;
}

function stamp(file) {
  execFileSync(process.execPath, [script, 'stamp', file, '--revision', '2', '--approved-by', 'tester',
    '--approved-at', '2026-11-22T10:00:00Z', '--base-sha', 'abc123']);
  return file;
}

const fence = '```';
const meta = `${fence}spec-meta
difficulty: moderate   # several files, new tests
builder: sonnet/high
override: none
scope:
  - skills/factory/SKILL.md
  - skills/prepare-spec/scripts/
${fence}`;

function issueDoc({ summaryExtra = '', metaBlock = meta, full = 'Build the thing.', title = '# Spec: Sample' } = {}) {
  return `${title}

## Summary

**Goal:** Do it.

**Build**
${metaBlock}
${summaryExtra}
<details>
<summary>Full spec</summary>

${full}

</details>
`;
}

function pin(text, { stamped = true } = {}) {
  const file = write(text);
  if (stamped) stamp(file);
  const out = path.join(dir, `out-${count}`);
  return { ...run('pin', file, '--out', out), out };
}

function expectEscalate(text, reason, options) {
  const { code, json, out } = pin(text, options);
  assert.equal(code, 0);
  assert.equal(json.status, 'escalate', JSON.stringify(json));
  assert.equal(json.reason, reason, JSON.stringify(json));
  assert.equal(existsSync(out), false);
}

const sha = file => createHash('sha256').update(readFileSync(file)).digest('hex');

test('pins an issue-form document', () => {
  const nested = `${fence}\`markdown\n## Summary\n${fence}\`\n\n<details>\n<summary>Inner</summary>\n\nx\n\n</details>`;
  const { code, json, out } = pin(issueDoc({ full: `Build it.\n\n${nested}` }));
  assert.equal(code, 0);
  assert.equal(json.status, 'ok', JSON.stringify(json));
  assert.equal(json.meta.builder_model, 'sonnet');
  assert.equal(json.meta.difficulty_signals, 'several files, new tests');
  assert.deepEqual(json.meta.scope, ['skills/factory/SKILL.md', 'skills/prepare-spec/scripts/']);
  const record = JSON.parse(readFileSync(path.join(out, 'record.json'), 'utf8'));
  assert.equal(record.file_sha256.full_spec, sha(path.join(out, 'full-spec.md')));
  assert.equal(record.file_sha256.summary, sha(path.join(out, 'summary.md')));
  assert.equal(run('check', path.join(out, 'document.md')).json.spec_sha256, json.spec_sha256);
  assert.match(readFileSync(path.join(out, 'full-spec.md'), 'utf8'), /^# Spec: Sample\n\nBuild it\.\n[\s\S]*<\/details>\n$/);
  assert.doesNotMatch(readFileSync(path.join(out, 'summary.md'), 'utf8'), /Full spec/);
});

test('pins a local document with a Full spec heading', () => {
  const text = issueDoc().replace(/<details>\n<summary>Full spec<\/summary>\n\n([\s\S]*)\n\n<\/details>\n$/, '## Full spec\n\n$1\n');
  assert.equal(pin(text).json.status, 'ok');
});

test('CRLF input pins to the same hash', () => {
  assert.equal(pin(issueDoc().replace(/\n/g, '\r\n')).json.spec_sha256, pin(issueDoc()).json.spec_sha256);
});

test('escalates documents it cannot verify', () => {
  const metaWith = (from, to) => issueDoc({ metaBlock: meta.replace(from, to) });
  expectEscalate(issueDoc(), 'missing_record', { stamped: false });
  const edited = write(issueDoc());
  stamp(edited);
  writeFileSync(edited, readFileSync(edited, 'utf8').replace('Do it.', 'Do more.'));
  const result = run('pin', edited, '--out', path.join(dir, 'edited'));
  assert.equal(result.json.reason, 'hash_mismatch');
  expectEscalate(issueDoc({ title: '# Sample' }), 'missing_title');
  expectEscalate(issueDoc({ summaryExtra: '\n## Summary\n' }), 'summary_heading');
  expectEscalate(issueDoc().replace('<summary>Full spec</summary>', '<summary>Spec</summary>'), 'full_spec_missing');
  expectEscalate(issueDoc({ summaryExtra: '\n## Full spec\n' }), 'full_spec_ambiguous');
  expectEscalate(issueDoc({ full: '' }), 'full_spec_empty');
  expectEscalate(issueDoc({ metaBlock: '' }), 'meta_missing');
  expectEscalate(issueDoc({ summaryExtra: `\n${meta}\n` }), 'meta_multiple');
  expectEscalate(issueDoc({ full: meta }), 'meta_outside_summary');
  for (const [from, to] of [
    ['override: none', 'override: none\ncolor: red'],
    ['override: none', 'override: none\noverride: none'],
    ['difficulty: moderate', 'difficulty: extreme'],
    ['sonnet/high', 'sonnet/xhigh'],
    [/scope:(\n {2}- .*)+/, 'scope:'],
    ['skills/factory/SKILL.md', '../outside'],
    ['skills/factory/SKILL.md', '/abs/path'],
    ['skills/factory/SKILL.md', 'skills/*.md'],
    ['skills/factory/SKILL.md', 'skills/prepare-spec/scripts/'],
  ]) {
    expectEscalate(metaWith(from, to), 'meta_invalid');
  }
});

test('argument errors exit 2', () => {
  const file = stamp(write(issueDoc()));
  assert.equal(run('pin', file).code, 2);
  const out = path.join(dir, 'twice');
  assert.equal(run('pin', file, '--out', out).json.status, 'ok');
  assert.equal(run('pin', file, '--out', out).code, 2);
});

function built(text) {
  return run('built', write(text)).json;
}

const hash = 'a'.repeat(64);
const block = keys => `## Summary\n\n- Changed things.\n\nCloses #4\n\n${fence}spec-built\n${keys}\n${fence}\n`;

test('reads spec-built blocks', () => {
  assert.deepEqual(built(block(`issue: #4\nrevision: 2\nspec_sha256: ${hash}`)),
    { status: 'ok', built: { revision: 2, spec_sha256: hash, issue: 4 } });
  const file = stamp(write(issueDoc()));
  const document = readFileSync(path.join(pin(readFileSync(file, 'utf8'), { stamped: false }).out, 'document.md'), 'utf8');
  const docHash = createHash('sha256').update(document).digest('hex');
  const local = `${block(`source: SPEC.md\nbranch: feat\nrevision: 2\nspec_sha256: ${docHash}`)}\n<details>\n<summary>Spec</summary>\n\n${document}\n</details>\n`;
  assert.equal(built(local).status, 'ok', JSON.stringify(built(local)));
  assert.equal(built(local.replace('Do it.', 'Do more.')).reason, 'built_hash_mismatch');
  assert.equal(built(block(`source: SPEC.md\nbranch: feat\nrevision: 2\nspec_sha256: ${hash}`)).reason, 'built_document_missing');
});

test('escalates bad spec-built blocks', () => {
  assert.equal(built('## Summary\n\nNothing.\n').reason, 'built_missing');
  assert.equal(built('## Spec rev 2\n\n# Spec: Old\n').reason, 'legacy_section');
  const good = `issue: #4\nrevision: 2\nspec_sha256: ${hash}`;
  assert.equal(built(block(good) + block(good)).reason, 'built_multiple');
  for (const keys of [
    `issue: #4\nsource: SPEC.md\nrevision: 2\nspec_sha256: ${hash}`,
    `issue: #4\nbranch: feat\nrevision: 2\nspec_sha256: ${hash}`,
    `issue: #4\nrevision: 2\nspec_sha256: abc`,
    `issue: #4\nrevision: 0\nspec_sha256: ${hash}`,
    `issue: #4\nrevision: 2\nspec_sha256: ${hash}\nextra: 1`,
  ]) {
    assert.equal(built(block(keys)).reason, 'built_invalid', keys);
  }
});

test('escalates a record that is not approved', () => {
  const file = stamp(write(issueDoc()));
  writeFileSync(file, readFileSync(file, 'utf8').replace('status: approved', 'status: draft'));
  assert.equal(run('pin', file, '--out', path.join(dir, 'draft')).json.reason, 'not_approved');
});

test('check and stamp output is unchanged', () => {
  // Golden values produced by the version before pin and built were added.
  const golden = '1e78abc49a7dab8b0a19b73050d90cdd78735afe07aee55d3b4abf40b2413356';
  const file = write('# Spec: Golden\r\n\r\n## Summary  \r\n\r\nKeep it.\r\n\r\n\r\n');
  assert.equal(spawnSync(process.execPath, [script, 'check', file], { encoding: 'utf8' }).stdout,
    `{"spec_sha256":"${golden}","record":null,"hash_matches":null}\n`);
  execFileSync(process.execPath, [script, 'stamp', file, '--revision', '3', '--approved-by', 'golden',
    '--approved-at', '2026-01-02T03:04:05Z', '--base-sha', 'deadbeef', '--branch', '']);
  assert.equal(readFileSync(file, 'utf8'), '<!-- spec-record\nstatus: approved\nrevision: 3\napproved_by: golden\n'
    + `approved_at: 2026-01-02T03:04:05Z\nbase_sha: deadbeef\nbranch: \nspec_sha256: ${golden}\n-->\n\n`
    + '# Spec: Golden\n\n## Summary\n\nKeep it.\n');
});

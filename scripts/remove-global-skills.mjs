#!/usr/bin/env node
/**
 * Node 18+. Remove globally installed copies of this repo's skills so
 * scripts/link-skills.sh can replace them with symlinks.
 *
 * Usage: scripts/remove-global-skills.mjs [--dry-run]
 * Override targets with AGENTS_SKILLS_DIR, CLAUDE_SKILLS_DIR, SKILLS_LOCK_FILE.
 */
import { lstatSync, readdirSync, readFileSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';

const repo = resolve(dirname(process.argv[1]), '..');
const home = process.env.HOME ?? homedir();
const agentsDir = process.env.AGENTS_SKILLS_DIR || `${home}/.agents/skills`;
const claudeDir = process.env.CLAUDE_SKILLS_DIR || `${home}/.claude/skills`;
const lock = process.env.SKILLS_LOCK_FILE || `${home}/.agents/.skill-lock.json`;
const dryRun = process.argv[2] === '--dry-run';

function skillNames(dir) {
  let names;
  try {
    names = readdirSync(dir);
  } catch (error) {
    if (['ENOENT', 'ENOTDIR', 'EACCES'].includes(error.code)) return [];
    throw error;
  }
  return names
    .filter((name) => !name.startsWith('.') && statSync(`${dir}/${name}/SKILL.md`, { throwIfNoEntry: false })?.isFile())
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function readLock() {
  const contents = readFileSync(lock, 'utf8');
  return contents.trim() ? JSON.parse(contents) : null;
}

function lockSource(name) {
  if (!statSync(lock, { throwIfNoEntry: false })?.isFile()) return '';

  let value = readLock();
  for (const key of ['skills', name, 'source']) {
    if (value == null) return '';
    if (typeof value !== 'object' || Array.isArray(value)) {
      throw new SyntaxError(`Cannot read '${key}' from ${lock}`);
    }
    value = Object.hasOwn(value, key) ? value[key] : null;
  }
  if (value == null || value === false) return '';
  return typeof value === 'string' ? value.replace(/\n+$/, '') : JSON.stringify(value, null, 2);
}

function removeCopies() {
  const skills = [...skillNames(`${repo}/skills`), ...skillNames(`${repo}/skills/legacy`)];
  for (const name of skills) {
    const copy = `${agentsDir}/${name}`;
    const copyInfo = lstatSync(copy, { throwIfNoEntry: false });
    if (!copyInfo || copyInfo.isSymbolicLink()) continue;

    const source = lockSource(name);
    if (!source.startsWith('mdjastrzebski/')) {
      console.error(`skip   ${copy} (lock source '${source || 'none'}' is not mdjastrzebski/*)`);
      continue;
    }

    console.log(`remove ${copy} (installed from ${source})`);
    if (dryRun) console.log(`would: rm -rf ${copy}`);
    else rmSync(copy, { recursive: true, force: true });

    const claudeCopy = `${claudeDir}/${name}`;
    if (lstatSync(claudeCopy, { throwIfNoEntry: false })?.isSymbolicLink()) {
      if (dryRun) console.log(`would: rm ${claudeCopy}`);
      else unlinkSync(claudeCopy);
    }

    if (dryRun) {
      console.log(`would: drop '${name}' from ${lock}`);
    } else {
      const data = readLock();
      delete data?.skills?.[name];
      writeFileSync(lock, `${JSON.stringify(data, null, 2)}\n`);
    }
  }
}

try {
  removeCopies();
} catch (error) {
  console.error(error.message);
  process.exitCode = error instanceof SyntaxError ? 5 : 1;
}

#!/usr/bin/env node
/**
 * Node 18+. List a repository's agent docs or check the paths they cite.
 *
 * Run from the repository root. Read-only.
 *   node <skill-dir>/scripts/agent_docs.mjs list
 *   node <skill-dir>/scripts/agent_docs.mjs check-paths
 */
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';

const agentDoc = /(^|\/)(AGENTS|CLAUDE|GEMINI)\.md$|(^|\/)\.cursorrules$|^\.cursor\/rules\/|^\.github\/copilot-instructions\.md$|^\.github\/instructions\/|^\.windsurfrules$|^docs\/agents\//i;

function sortedUnique(paths) {
  return [...new Set(paths)].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
}

function collectFiles(dir, paths) {
  let entries;
  try {
    if (!lstatSync(dir).isDirectory()) return;
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) collectFiles(path, paths);
    if (entry.isFile()) paths.push(path);
  }
}

function list() {
  let trackedAndUntracked;
  try {
    trackedAndUntracked = execFileSync('git', ['ls-files', '-co', '--exclude-standard'], {
      encoding: 'utf8',
      maxBuffer: Infinity,
      stdio: ['ignore', 'pipe', 'inherit'],
    });
  } catch (error) {
    trackedAndUntracked = error.stdout ?? '';
  }

  const paths = trackedAndUntracked.split('\n');
  // Supplement Git's list with files under docs/agents/, which may be ignored.
  collectFiles('docs/agents', paths);
  return sortedUnique(paths.filter((path) => agentDoc.test(path)));
}

function checkPaths() {
  const citedPaths = [];
  for (const path of list()) {
    let contents;
    try {
      contents = readFileSync(path, 'utf8');
    } catch {
      continue;
    }
    if (contents.includes('\0')) continue;
    for (const line of contents.split('\n')) {
      for (const [, citation] of line.matchAll(/`([^` ]+\/[^` ]*)`/g)) {
        if (!/[<*]/.test(citation)) citedPaths.push(citation);
      }
    }
  }

  for (const citation of sortedUnique(citedPaths)) {
    const path = citation.replace(/^[ \t]+|[ \t]+$/g, '');
    if (!existsSync(path)) console.log(`missing: ${path}`);
  }
}

switch (process.argv[2]) {
  case 'list':
    for (const path of list()) console.log(path);
    break;
  case 'check-paths':
    checkPaths();
    break;
  default:
    console.error(`usage: ${process.argv[1]} list|check-paths`);
    process.exitCode = 2;
}

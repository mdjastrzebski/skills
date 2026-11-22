#!/usr/bin/env node
/**
 * Factory local bookkeeping. Node 18+, no GitHub or network access.
 *
 * node factory.mjs diagnostics --stage NAME --usage FILE [--usage FILE]... --out FILE
 * node factory.mjs ledger --body FILE --rows FILE --out FILE
 * node factory.mjs section --body FILE --heading TEXT [--match-prefix] --content FILE --out FILE
 * node factory.mjs review --commit SHA --body FILE --comments FILE --diff FILE --out FILE
 * node factory.mjs checkpoint get --file FILE [KEY]
 * node factory.mjs checkpoint set --file FILE KEY VALUE_JSON
 * node factory.mjs checkpoint append --file FILE KEY VALUE_JSON
 * node factory.mjs stage open --file FILE --stage NAME
 * node factory.mjs stage close --file FILE --stage NAME [--until ISO]
 *     [--session-id ID] [--transcript PATH]...
 * node factory.mjs compare snapshot --head SHA --base-ref REF --base-sha SHA
 * node factory.mjs compare same --a JSON --b JSON
 * node factory.mjs compare range --round1 JSON --current JSON
 * node factory.mjs verify-commits --from SHA --to SHA --rows FILE
 *
 * Commands return one JSON object. Exit 2 for invalid input, 1 for operational errors.
 * A completed verification may return ok:false with exit 0 to report its findings.
 */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";

class UsageError extends Error {}

const evidenceStart = "<!-- evidence-trail:start -->";
const evidenceEnd = "<!-- evidence-trail:end -->";
const tokenFields = ["input", "output", "cache_read", "cache_write_5m", "cache_write_1h"];
const comparisonFields = ["head", "base_ref", "merge_base"];
const has = (object, key) => Object.hasOwn(object, key);
const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isText = (value) => typeof value === "string" && value.trim() !== "";
const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
const isCost = (value) => Number.isFinite(value) && value >= 0;
const count = (value) => value.toLocaleString("en-US");
const dollars = (value) => `$${value.toFixed(2)}`;
const formatDate = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric" });

function requireInput(condition, message) {
  if (!condition) throw new UsageError(message);
}

function parseArgs(argv, { required = [], optional = [], repeated = [], switches = [], positions = [0, 0] }) {
  const options = Object.create(null);
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      requireInput(!arg.startsWith("-") || /^-\d/.test(arg), `unknown argument: ${arg}`);
      positional.push(arg);
      continue;
    }
    const match = /^--([a-z][a-z0-9-]*)(?:=([\s\S]*))?$/.exec(arg);
    requireInput(match, `unknown argument: ${arg}`);
    const [, flag, inline] = match;
    requireInput([...required, ...optional, ...repeated, ...switches].includes(flag), `unknown argument: --${flag}`);
    requireInput(!has(options, flag) || repeated.includes(flag), `duplicate argument: --${flag}`);
    if (switches.includes(flag)) {
      requireInput(inline === undefined, `--${flag} does not take a value`);
      options[flag] = true;
    } else {
      const value = inline ?? argv[++i];
      requireInput(isText(value) && (inline !== undefined || !value.startsWith("--")), `--${flag} needs a value`);
      if (repeated.includes(flag)) (options[flag] ??= []).push(value);
      else options[flag] = value;
    }
  }
  for (const flag of required) requireInput(has(options, flag), `missing --${flag}`);
  requireInput(positional.length >= positions[0] && positional.length <= positions[1], "wrong number of positional arguments");
  return { options, positional };
}

function read(file) {
  try {
    return fs.readFileSync(file);
  } catch (error) {
    throw new UsageError(`cannot read ${file}: ${error.message}`);
  }
}

function parseJson(text, label) {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new UsageError(`invalid JSON in ${label}: ${error.message}`);
  }
}

function readJson(file) {
  return parseJson(read(file).toString("utf8"), file);
}

function writeAtomic(file, content) {
  const temp = path.join(path.dirname(file), `.${randomUUID()}.tmp`);
  fs.writeFileSync(temp, content, { flag: "wx", mode: 0o600 });
  try {
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function json(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function markdownCell(value) {
  return String(value).replaceAll("|", "\\|").replace(/\r?\n/g, "<br>");
}

function isoTime(value) {
  requireInput(typeof value === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})$/.test(value)
    && Number.isFinite(Date.parse(value)), `invalid ISO time: ${value}`);
  const date = value.slice(0, 10);
  requireInput(new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date, `invalid ISO date: ${value}`);
  return new Date(value).toISOString();
}

function formatTime(value) {
  const date = new Date(value);
  return `${formatDate.format(date)} ${date.toISOString().slice(11, 16)}`;
}

function formatWindow(since, until) {
  const first = formatTime(since);
  const last = formatTime(until);
  return `${first}–${since.slice(0, 10) === until.slice(0, 10) ? last.slice(-5) : last} UTC`;
}

function unavailable(reason) {
  return { available: false, reason, models: [], tokens: null, cost_usd: null, block: `Diagnostics unavailable: ${reason}\n` };
}

function readUsage(report) {
  requireInput(isObject(report), "usage report must be an object");
  if (isText(report.error)) throw new UsageError(report.error);
  requireInput(isObject(report.models) && isObject(report.totals), "usage report is missing models or totals");
  if (report.totals.usage_complete === false) {
    const warnings = Array.isArray(report.format_warnings) ? report.format_warnings.filter(isText) : [];
    throw new UsageError(warnings.join(" · ") || "transcript usage is incomplete");
  }
  requireInput(["claude", "codex"].includes(report.harness) && Array.isArray(report.sources) && isObject(report.window),
    "usage report is missing a supported harness, sources or window");
  const since = isoTime(report.window.since);
  const until = isoTime(report.window.until);
  requireInput(since <= until, "usage window ends before it starts");
  requireInput(/^\d{4}-\d{2}-\d{2}$/.test(report.prices_as_of) && Number.isFinite(Date.parse(report.prices_as_of)),
    "usage report is missing its prices date");
  return { ...report, window: { since, until } };
}

function diagnosticsBlock(stage, files) {
  let reports;
  try {
    reports = files.map((file) => readUsage(readJson(file)));
    for (const { models, totals } of reports) {
      for (const row of [...Object.values(models), totals]) {
        requireInput(isObject(row) && tokenFields.every((field) => isCount(row[field]))
          && (row.cost_usd === null || isCost(row.cost_usd)), "usage report has an invalid token or cost value");
      }
    }
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    return unavailable(error.message);
  }
  const models = new Map();
  const sources = new Map();
  let since = reports[0].window.since;
  let until = reports[0].window.until;
  let prices = reports[0].prices_as_of;
  const totals = sumUsage(reports.map((report) => report.totals));
  for (const report of reports) {
    if (report.window.since < since) since = report.window.since;
    if (report.window.until > until) until = report.window.until;
    if (report.prices_as_of > prices) prices = report.prices_as_of;
    const paths = sources.get(report.harness) ?? new Set();
    for (const source of report.sources) {
      if (source?.role === "subagent") paths.add(source.path);
    }
    sources.set(report.harness, paths);
    for (const [model, row] of Object.entries(report.models)) {
      if (!models.has(model)) models.set(model, []);
      models.get(model).push(row);
    }
  }
  const names = [...models.keys()].sort();
  const rows = names.map((model) => {
    const row = sumUsage(models.get(model));
    return usageRow(markdownCell(model), row, row.cost_usd === null ? `unknown (no price for ${markdownCell(model)})` : dollars(row.cost_usd));
  });
  const source = [...sources].map(([harness, paths]) => {
    return `${harness === "claude" ? "Claude Code" : "Codex"} transcript (main + ${paths.size} subagents)`;
  }).join(" + ");
  const block = [
    `<details><summary>Diagnostics — ${stage}</summary>`, "",
    "| Model | Input | Output | Cache read | Cache write | Cost (USD) |",
    "| --- | ---: | ---: | ---: | ---: | ---: |", ...rows,
    usageRow("**Total**", totals, `**${totals.cost_usd === null ? "unknown" : dollars(totals.cost_usd)}**`), "",
    `Window: ${formatWindow(since, until)} · Source: ${source} · Prices as of ${formatDate.format(new Date(prices))}`,
    "</details>", "",
  ].join("\n");
  const tokens = tokenFields.reduce((sum, field) => sum + totals[field], 0);
  return { available: true, models: names, tokens, cost_usd: totals.cost_usd, block };
}

function sumUsage(rows) {
  const result = Object.fromEntries(tokenFields.map((field) => [field, rows.reduce((sum, row) => sum + row[field], 0)]));
  result.cost_usd = rows.some((row) => row.cost_usd === null || row.cost_complete === false)
    ? null : Math.round(rows.reduce((sum, row) => sum + row.cost_usd, 0) * 1e6) / 1e6;
  return result;
}

function usageRow(label, row, cost) {
  const numbers = [row.input, row.output, row.cache_read, row.cache_write_5m + row.cache_write_1h].map(count);
  return `| ${[label, ...numbers, cost].join(" | ")} |`;
}

// Use a one-byte string for offsets, including when the body has CRLF or non-ASCII text.
function* markdownLines(bytes) {
  let fence = null;
  for (const { 0: raw, index } of bytes.matchAll(/[^\n]+/g)) {
    const line = raw.replace(/\r$/, "");
    const fenceLine = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceLine) {
      if (!fence) fence = fenceLine[1];
      else if (fence[0] === fenceLine[1][0] && fenceLine[1].length >= fence.length && !fenceLine[2].trim()) fence = null;
    } else if (!fence) yield { line, index };
  }
}

function bodyMarkers(bytes) {
  let marks = null;
  for (const { line, index } of markdownLines(bytes)) {
    const marker = line.trim();
    if (marker === evidenceStart) {
      requireInput(!marks, "duplicate evidence-trail start marker");
      marks = { start: index + line.indexOf(marker), lineStart: index };
    }
    if (marker === evidenceEnd) {
      requireInput(marks && marks.end === undefined, "unbalanced or duplicate evidence-trail end marker");
      marks.end = index + line.indexOf(marker);
    }
  }
  requireInput(!marks || marks.end !== undefined, "unbalanced evidence-trail markers");
  return marks;
}

function edit(buffer, start, end, replacement) {
  return Buffer.concat([buffer.subarray(0, start), Buffer.from(replacement), buffer.subarray(end)]);
}

function spacing(bytes, eol) {
  if (!bytes || /\r?\n\r?\n$/.test(bytes)) return "";
  return bytes.endsWith("\n") ? eol : eol + eol;
}

function ledger(options) {
  const body = read(options.body);
  const bytes = body.toString("latin1");
  const eol = bytes.includes("\r\n") ? "\r\n" : "\n";
  const marks = bodyMarkers(bytes);
  const rows = readJson(options.rows);
  requireInput(Array.isArray(rows), "ledger rows must be a JSON array");
  const table = [
    "<details><summary>Evidence trail</summary>", "",
    "| # | Stage | Skill or agent | Outcome | Link | Models | Tokens | Cost |",
    "| --- | --- | --- | --- | --- | --- | ---: | ---: |",
  ];
  const sum = { tokens: 0, cost_usd: 0 };
  const incomplete = new Set();
  for (const row of rows) {
    requireInput(isObject(row) && isCount(row.n) && isText(row.stage)
      && [row.skill, row.outcome, row.link].every((value) => value === null || typeof value === "string")
      && (row.models === null || typeof row.models === "string" || (Array.isArray(row.models) && row.models.every(isText)))
      && (row.tokens === null || isCount(row.tokens)) && (row.cost_usd === null || isCost(row.cost_usd)), "invalid ledger row");
    for (const field of Object.keys(sum)) {
      if (row[field] === null) incomplete.add(field);
      else sum[field] += row[field];
    }
    const readyTail = row.stage === "Ready" && row.models === null && row.tokens === 0 && row.cost_usd === 0;
    const tokens = row.tokens === null ? "—" : count(row.tokens);
    const cost = row.cost_usd === null ? "—" : dollars(row.cost_usd);
    const cells = [row.n, row.stage, row.skill ?? "", row.outcome ?? "", row.link ?? "",
      Array.isArray(row.models) ? row.models.join(", ") : row.models ?? "",
      readyTail ? "" : tokens, readyTail ? "" : cost];
    table.push(`| ${cells.map(markdownCell).join(" | ")} |`);
  }
  const total = (field, formatter) => incomplete.has(field) ? `≥ ${formatter(sum[field])} (incomplete)` : formatter(sum[field]);
  table.push(`| | **Run total** | | | | | **${total("tokens", count)}** | **${total("cost_usd", dollars)}** |`, "", "</details>");
  const panel = table.join(eol);
  const result = marks
    ? edit(body, marks.start + evidenceStart.length, marks.end, `${eol}${panel}${eol}`)
    : edit(body, body.length, body.length, `${spacing(bytes, eol)}${evidenceStart}${eol}${panel}${eol}${evidenceEnd}${eol}`);
  fs.writeFileSync(options.out, result);
  return { rows: rows.length };
}

function section(options) {
  const body = read(options.body);
  const bytes = body.toString("latin1");
  const eol = bytes.includes("\r\n") ? "\r\n" : "\n";
  const marks = bodyMarkers(bytes);
  const atxHeading = (line) => /^ {0,3}(#{1,6})[ \t]+(.+?)\s*$/.exec(line);
  requireInput(!/[\r\n]/.test(options.heading), "--heading must be one line");
  const heading = atxHeading(options.heading);
  const headingLevel = heading?.[1].length;
  const title = Buffer.from((heading?.[2] ?? options.heading).trim().replace(/[ \t]+#+$/, "")).toString("latin1");
  let start = null;
  let end = marks?.lineStart ?? body.length;
  let level;
  for (const { line, index } of markdownLines(bytes)) {
    if (index >= end) break;
    const atx = atxHeading(line);
    if (start !== null) {
      if ((atx && atx[1].length <= level) || /^\s*Closes #\d+\s*$/i.test(line)) {
        end = index;
        break;
      }
    } else if (atx && (!headingLevel || atx[1].length === headingLevel)) {
      const candidate = atx[2].replace(/[ \t]+#+$/, "");
      if (options["match-prefix"] ? candidate.startsWith(title) : candidate === title) {
        start = index;
        level = atx[1].length;
      }
    }
  }
  const content = read(options.content);
  const suffix = end < body.length ? spacing(content.toString("latin1"), eol) : "";
  const prefix = start === null ? spacing(bytes.slice(0, end), eol) : "";
  const replacement = Buffer.concat([Buffer.from(prefix), content, Buffer.from(suffix)]);
  fs.writeFileSync(options.out, edit(body, start ?? end, end, replacement));
  return { replaced: start !== null, inserted: start === null };
}

function diffPath(value) {
  if (value === "/dev/null") return null;
  if (!value.startsWith('"')) return value.replace(/^b\//, "").replace(/\t$/, "");
  requireInput(value.endsWith('"'), "invalid quoted path in diff");
  const escapes = { a: "\x07", b: "\b", t: "\t", n: "\n", v: "\x0b", f: "\f", r: "\r", '"': '"', "\\": "\\" };
  const bytes = value.slice(1, -1).replace(/\\([0-7]{3}|.)/g, (_, escaped) => {
    if (escaped.length === 3) return String.fromCharCode(Number.parseInt(escaped, 8));
    requireInput(has(escapes, escaped), "invalid path escape in diff");
    return escapes[escaped];
  });
  return Buffer.from(bytes, "latin1").toString("utf8").replace(/^b\//, "");
}

function rightLines(diff) {
  const anchors = new Map();
  let file = null;
  let hunk = null;
  for (const line of diff.split("\n")) {
    if (hunk) {
      if (line.startsWith("\\ No newline at end of file")) continue;
      if (line[0] === " " || line[0] === "+") {
        if (file !== null) anchors.get(file).add(hunk.line);
        hunk.line++;
        hunk.right--;
      }
      if (line[0] === " " || line[0] === "-") hunk.left--;
      requireInput(/[ +\-]/.test(line[0] ?? "") && hunk.left >= 0 && hunk.right >= 0, "invalid unified diff hunk");
      if (!hunk.left && !hunk.right) hunk = null;
      continue;
    }
    if (line.startsWith("diff --git ")) file = null;
    if (line.startsWith("+++ ")) {
      file = diffPath(line.slice(4).replace(/\r$/, ""));
      if (file !== null && !anchors.has(file)) anchors.set(file, new Set());
    }
    const match = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (match) {
      const left = Number(match[1] ?? 1);
      const right = Number(match[3] ?? 1);
      if (left || right) hunk = { left, right, line: Number(match[2]) };
    }
  }
  requireInput(!hunk, "incomplete unified diff hunk");
  return anchors;
}

function review(options) {
  requireInput(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(options.commit), "--commit must be a full commit SHA");
  const comments = readJson(options.comments);
  requireInput(Array.isArray(comments), "review comments must be a JSON array");
  const anchors = rightLines(read(options.diff).toString("utf8"));
  let body = read(options.body).toString("utf8");
  const inline = [];
  const moved = [];
  for (const comment of comments) {
    requireInput(isObject(comment) && isText(comment.path) && isCount(comment.line) && comment.line > 0
      && isText(comment.body), "invalid review comment");
    const { path: file, line, body: text } = comment;
    if (anchors.get(file)?.has(line)) inline.push({ path: file, line, side: "RIGHT", body: text });
    else moved.push(`- ${file}:${line}\n\n${text.split("\n").map((paragraph) => `  ${paragraph}`).join("\n")}`);
  }
  if (moved.length) body += `${spacing(body, "\n")}### Findings without an inline position\n\n${moved.join("\n\n")}\n`;
  fs.writeFileSync(options.out, json({ commit_id: options.commit, event: "COMMENT", body, comments: inline }));
  return { inline: inline.length, moved: moved.length };
}

function readCheckpoint(file, create = false) {
  if (create && !fs.existsSync(file)) return {};
  const data = readJson(file);
  requireInput(isObject(data), "checkpoint must be a JSON object");
  return data;
}

function keyParts(key) {
  const parts = key.split(".");
  requireInput(parts.every((part) => part !== ""), `invalid checkpoint key: ${key}`);
  return parts;
}

function lookup(data, parts) {
  let value = data;
  for (const part of parts) {
    if (!isObject(value) && !Array.isArray(value)) return { found: false };
    if (!has(value, part) || (Array.isArray(value) && !/^(0|[1-9]\d*)$/.test(part))) return { found: false };
    value = value[part];
  }
  return { found: true, value };
}

function assign(data, key, value) {
  Object.defineProperty(data, key, { value, enumerable: true, configurable: true, writable: true });
}

function checkpoint(action, argv) {
  const { options, positional } = parseArgs(argv, { required: ["file"], positions: action === "get" ? [0, 1] : [2, 2] });
  const [key, input] = positional;
  const data = readCheckpoint(options.file, action !== "get");
  if (action === "get") return lookup(data, key === undefined ? [] : keyParts(key));
  const parts = keyParts(key);
  const last = parts.pop();
  let node = data;
  for (const part of parts) {
    if (!has(node, part)) assign(node, part, {});
    requireInput(isObject(node[part]), `parent of ${key} is not an object`);
    node = node[part];
  }
  let value = parseJson(input, key);
  if (action === "append") {
    const existing = has(node, last) ? node[last] : [];
    requireInput(Array.isArray(existing), `${key} is not an array`);
    value = [...existing, value];
  }
  assign(node, last, value);
  writeAtomic(options.file, json(data));
  return { value };
}

function runReport(run, start, end, options) {
  requireInput(isObject(run), "checkpoint run must be an object");
  for (const field of ["harness", "cwd", "session_id", "prices"]) {
    requireInput(run[field] == null || isText(run[field]), `run.${field} must be a string`);
  }
  requireInput(run.transcripts == null || (Array.isArray(run.transcripts) && run.transcripts.every(isText)),
    "run.transcripts must be an array of paths");
  const session = options["session-id"] ?? run.session_id;
  const transcripts = options.transcript ?? (session === run.session_id ? run.transcripts ?? [] : []);
  if (!isText(session) && transcripts.length === 0) return { error: "active session ID or transcript could not be verified" };
  const args = [fileURLToPath(new URL("usage-report.mjs", import.meta.url)), "--since", start, "--until", end];
  for (const [flag, value] of [["harness", run.harness], ["cwd", run.cwd], ["session-id", session], ["prices", run.prices]]) {
    if (value) args.push(`--${flag}`, value);
  }
  for (const transcript of transcripts) args.push("--transcript", transcript);
  const result = spawnSync(process.execPath, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error || result.status !== 0) return { error: result.error?.message ?? (result.stderr.trim() || "usage-report failed") };
  try {
    return parseJson(result.stdout, "usage-report output");
  } catch (error) {
    return { error: error.message };
  }
}

function stage(action, argv) {
  const { options } = parseArgs(argv, { required: ["file", "stage"],
    optional: action === "close" ? ["until", "session-id"] : [], repeated: action === "close" ? ["transcript"] : [] });
  const data = readCheckpoint(options.file, action === "open");
  data.stages ??= {};
  requireInput(isObject(data.stages), "checkpoint stages must be an object");
  const name = options.stage;
  requireInput(!/[\r\n.]/.test(name), "stage name may not contain newlines or dots");
  const current = has(data.stages, name) ? data.stages[name] : null;
  let result;
  if (action === "open") {
    requireInput(!has(data.stages, name), `stage already exists: ${name}`);
    const previous = Object.values(data.stages).at(-1);
    requireInput(!previous || (isObject(previous) && previous.end && !previous.split_pending), "previous stage is still open");
    result = { start: previous ? isoTime(previous.end) : new Date().toISOString() };
  } else {
    requireInput(isObject(current), `stage is not open: ${name}`);
    const start = isoTime(current.start);
    const end = options.until ? isoTime(options.until) : new Date().toISOString();
    const splitting = Boolean(options["session-id"] || options.transcript);
    requireInput(!current.end || current.split_pending, `stage is already closed: ${name}`);
    const partStart = current.end ? isoTime(current.end) : start;
    requireInput(partStart <= end, "stage ends before it starts");
    const stem = `${path.resolve(options.file)}.${encodeURIComponent(name)}`;
    const parts = current.parts ?? [];
    const usage = `${stem}.usage${splitting || parts.length ? `.${parts.length + 1}` : ""}.json`;
    const diagnostics = `${stem}.diagnostics.md`;
    const report = runReport(data.run ?? {}, partStart, end, options);
    writeAtomic(usage, json(report));
    const allParts = [...parts, { start: partStart, end, usage,
      session_id: options["session-id"] ?? data.run?.session_id ?? null }];
    const { block, ...summary } = diagnosticsBlock(name, allParts.map((part) => part.usage));
    writeAtomic(diagnostics, block);
    result = { start, end, usage, diagnostics, ...summary };
    if (splitting || parts.length) Object.assign(result, { parts: allParts, split_pending: splitting });
  }
  assign(data.stages, name, result);
  writeAtomic(options.file, json(data));
  return result;
}

function git(args) {
  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, GIT_NO_LAZY_FETCH: "1", GIT_ALLOW_PROTOCOL: "" } });
  if (result.error) throw result.error;
  return result;
}

function commit(value) {
  requireInput(isText(value), "expected a commit SHA or ref");
  const result = git(["rev-parse", "--verify", "--quiet", "--end-of-options", `${value}^{commit}`]);
  requireInput(result.status === 0, `missing commit ${value} (fetch SHA first)`);
  return result.stdout.trim();
}

function snapshot(value, label) {
  const parsed = parseJson(value, label);
  requireInput(isObject(parsed) && comparisonFields.every((key) => isText(parsed[key])), `invalid comparison in ${label}`);
  return { head: commit(parsed.head), base_ref: parsed.base_ref, merge_base: commit(parsed.merge_base) };
}

function compare(action, argv) {
  const required = { snapshot: ["head", "base-ref", "base-sha"], same: ["a", "b"], range: ["round1", "current"] }[action];
  const { options } = parseArgs(argv, { required });
  if (action === "snapshot") {
    const head = commit(options.head);
    const base = commit(options["base-sha"]);
    const result = git(["merge-base", base, head]);
    requireInput(result.status === 0, "head and base have no available merge base (fetch SHA first)");
    return { head, base_ref: options["base-ref"], merge_base: result.stdout.trim() };
  }
  if (action === "same") {
    const a = snapshot(options.a, "--a");
    const b = snapshot(options.b, "--b");
    const differs = comparisonFields.filter((field) => a[field] !== b[field]);
    return { same: differs.length === 0, differs };
  }
  const earlier = snapshot(options.round1, "--round1");
  const current = snapshot(options.current, "--current");
  let reason;
  if (earlier.base_ref !== current.base_ref) reason = "base ref changed";
  else if (earlier.merge_base !== current.merge_base) reason = "merge base changed";
  else {
    const result = git(["merge-base", "--is-ancestor", earlier.head, current.head]);
    if (result.status === 1) reason = "earlier reviewed head is not an ancestor of the current head";
    else if (result.status !== 0) throw new Error(result.stderr.trim() || "git merge-base failed");
  }
  return { range: !reason, from: reason ? current.merge_base : earlier.head, to: current.head,
    reason: reason ?? "same base ref and merge base, and earlier reviewed head is an ancestor" };
}

function commitFiles(from, to) {
  const result = git(["log", "--format=%x00%H", "--name-only", "-z", "--no-renames", "--no-show-signature",
    "--diff-merges=first-parent", `${from}..${to}`, "--"]);
  if (result.status !== 0) throw new Error(result.stderr.trim() || "git log failed");
  const actual = new Map();
  const parts = result.stdout.split("\0");
  for (let i = 0; i < parts.length - 1;) {
    requireInput(parts[i++] === "", "unexpected git log commit separator");
    const sha = parts[i++];
    const files = [];
    while (i < parts.length && parts[i] !== "") {
      const name = parts[i++];
      files.push(files.length ? name : name.replace(/^\n/, ""));
    }
    actual.set(sha, files);
  }
  return actual;
}

function verifyCommits(options) {
  const from = commit(options.from);
  const to = commit(options.to);
  const rows = readJson(options.rows);
  requireInput(Array.isArray(rows), "verdict rows must be a JSON array");
  const actual = commitFiles(from, to);
  const reported = new Map();
  const missing = [];
  for (const row of rows) {
    requireInput(isObject(row) && (isText(row.id) || isCount(row.id)) && isText(row.verdict)
      && (row.commit === null || /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/i.test(row.commit))
      && Array.isArray(row.files) && row.files.every(isText), "invalid verdict row (expected full commit SHA or null and an array of files)");
    if (row.commit === null) continue;
    const sha = row.commit.toLowerCase();
    requireInput(!reported.has(sha), `duplicate verdict commit: ${sha}`);
    reported.set(sha, new Set(row.files));
    if (!actual.has(sha)) missing.push(sha);
  }
  const unreported = [];
  const out_of_scope = [];
  for (const [sha, files] of actual) {
    const allowed = reported.get(sha);
    if (!allowed) unreported.push(sha);
    else {
      const extra = files.filter((file) => !allowed.has(file));
      if (extra.length) out_of_scope.push({ commit: sha, files: extra });
    }
  }
  return { ok: !missing.length && !unreported.length && !out_of_scope.length, missing, unreported, out_of_scope };
}

function main(argv) {
  const [command, ...args] = argv;
  const actions = { checkpoint: ["get", "set", "append"], stage: ["open", "close"], compare: ["snapshot", "same", "range"] };
  if (command === "--help" || command === "-h") {
    const source = fs.readFileSync(new URL(import.meta.url), "utf8");
    return { usage: source.split("/**\n")[1].split(" */")[0].replace(/^ \* ?/gm, "") };
  }
  if (has(actions, command)) {
    const [action, ...rest] = args;
    requireInput(actions[command].includes(action), `unknown ${command} action: ${action ?? "missing"}`);
    return { checkpoint, stage, compare }[command](action, rest);
  }
  const flags = {
    diagnostics: { required: ["stage", "usage", "out"], repeated: ["usage"] },
    ledger: { required: ["body", "rows", "out"] },
    section: { required: ["body", "heading", "content", "out"], switches: ["match-prefix"] },
    review: { required: ["commit", "body", "comments", "diff", "out"] },
    "verify-commits": { required: ["from", "to", "rows"] },
  };
  requireInput(has(flags, command), `unknown command: ${command ?? "missing"} (use --help)`);
  const { options } = parseArgs(args, flags[command]);
  if (command === "diagnostics") {
    const { block, ...result } = diagnosticsBlock(options.stage, options.usage);
    fs.writeFileSync(options.out, block);
    return result;
  }
  return { ledger, section, review, "verify-commits": verifyCommits }[command](options);
}

try {
  const result = main(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify({ ok: true, ...result })}\n`);
} catch (error) {
  process.stderr.write(`factory: ${error.message}\n`);
  process.exitCode = error instanceof UsageError ? 2 : 1;
}

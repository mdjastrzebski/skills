#!/usr/bin/env node
/**
 * Report model, token, and cost usage for an agent session window, as JSON.
 *
 * Read-only. Node 18+, built-ins only. Supports Claude Code and Codex transcripts.
 *
 * Usage:
 *   node usage-report.mjs [--harness claude|codex|auto] [--since ISO8601] [--until ISO8601]
 *                         [--session-id ID] [--transcript PATH]... [--prices FILE] [--cwd DIR]
 *
 *   --harness     transcript format; auto (default) picks the harness with a transcript for the
 *                 cwd, the most recently modified if both
 *   --since/until only count records whose timestamp is inside [since, until]
 *   --session-id  use that session instead of the newest one for the cwd. Always pass it when
 *                 several sessions may share the cwd; without it, another session's usage inside
 *                 the window adds a format_warnings entry
 *   --transcript  explicit JSONL file (repeatable); skips discovery, including subagents
 *   --prices      JSON {model: {input, output, cache_write_5m, cache_write_1h, cache_read}} in
 *                 USD per MTok, merged over the built-in Anthropic prices
 *   --cwd         project directory to discover transcripts for (default: current directory)
 *
 * Claude Code: $CLAUDE_CONFIG_DIR or ~/.claude, projects/<cwd slug>/<session>.jsonl plus every
 *   *.jsonl under projects/<cwd slug>/<session>/ (subagents). Streamed messages repeat; dedupes
 *   by message.id, keeping the last.
 * Codex: $CODEX_HOME or ~/.codex, sessions/**\/rollout-*.jsonl. Counts deltas of the cumulative
 *   token_count totals, attributed to the latest turn_context model. Subagent rollouts are those
 *   whose session_meta names the main session as parent_thread_id or forked_from_id. The format
 *   is undocumented; surprises are listed in format_warnings.
 *
 * Output: {harness, session_id, window, sources, models, totals, prices_as_of, skipped_lines,
 *   format_warnings}. Per model: input, output, reasoning_output (Codex only, included in output),
 *   cache_read, cache_write_5m, cache_write_1h, messages (Claude) or events (Codex), cost_usd.
 *   Codex input excludes cached tokens. A model with no price has cost_usd null and the totals
 *   have cost_complete false, and totals.cost_usd is null (cost_usd_known sums the priced models).
 *   Never estimate a missing price. The long-context Haiku tier is
 *   ignored.
 *
 * Exit: 0 ok (models empty when nothing matched), 2 bad arguments or no transcript found.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const PRICES_AS_OF = "2026-11-03";
// USD per MTok, Anthropic first party.
const BUILTIN_PRICES = {
  "claude-opus-5-5": { input: 4, output: 20, cache_write_5m: 5, cache_write_1h: 8, cache_read: 0.2 },
  "claude-sonnet-5-5": { input: 2, output: 10, cache_write_5m: 2.5, cache_write_1h: 4, cache_read: 0.1 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cache_write_5m: 0.125, cache_write_1h: 0.2, cache_read: 0.01 },
  "claude-fable-5-2": { input: 8, output: 40, cache_write_5m: 10, cache_write_1h: 16, cache_read: 0.2 },
};
const TOKEN_FIELDS = ["input", "output", "cache_read", "cache_write_5m", "cache_write_1h"];

class UsageError extends Error {}

function parseArgs(argv) {
  const opts = { harness: "auto", transcripts: [] };
  const valueFlags = ["harness", "since", "until", "session-id", "transcript", "prices", "cwd"];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
      continue;
    }
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (!m || !valueFlags.includes(m[1])) throw new UsageError(`unknown argument: ${arg}`);
    let value = m[2];
    if (value === undefined) {
      value = argv[++i];
      if (value === undefined) throw new UsageError(`--${m[1]} needs a value`);
    }
    if (m[1] === "transcript") opts.transcripts.push(value);
    else opts[m[1].replace(/-(.)/g, (_, c) => c.toUpperCase())] = value;
  }
  if (!["auto", "claude", "codex"].includes(opts.harness)) {
    throw new UsageError("--harness must be claude, codex, or auto");
  }
  for (const key of ["since", "until"]) {
    if (opts[key] === undefined) continue;
    if (Number.isNaN(Date.parse(opts[key]))) throw new UsageError(`--${key} is not a valid ISO 8601 time: ${opts[key]}`);
  }
  return opts;
}

function helpText() {
  const src = fs.readFileSync(new URL(import.meta.url), "utf8");
  const m = /\/\*\*\n([\s\S]*?)\*\//.exec(src);
  return m[1].replace(/^ \* ?/gm, "").replace(/\*\\\//g, "*/");
}

// ---------- shared helpers ----------

function blankUsage() {
  return { input: 0, output: 0, reasoning_output: 0, cache_read: 0, cache_write_5m: 0, cache_write_1h: 0, count: 0 };
}

function num(v) {
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
}

function makeWindow(opts) {
  const since = opts.since === undefined ? null : Date.parse(opts.since);
  const until = opts.until === undefined ? null : Date.parse(opts.until);
  return {
    since: opts.since ?? null,
    until: opts.until ?? null,
    contains(ts) {
      if (since === null && until === null) return true;
      const t = typeof ts === "string" ? Date.parse(ts) : NaN;
      if (Number.isNaN(t)) return false;
      return (since === null || t >= since) && (until === null || t <= until);
    },
  };
}

async function forEachJsonl(file, onRecord, counters) {
  const rl = readline.createInterface({ input: fs.createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let rec;
    try {
      rec = JSON.parse(line);
    } catch {
      counters.skipped_lines++;
      continue;
    }
    if (rec && typeof rec === "object") onRecord(rec);
    else counters.skipped_lines++;
  }
}

function readFirstJsonLine(file) {
  const fd = fs.openSync(file, "r");
  try {
    const chunks = [];
    const buf = Buffer.alloc(65536);
    let total = 0;
    for (;;) {
      const n = fs.readSync(fd, buf, 0, buf.length, null);
      if (n === 0) break;
      const nl = buf.subarray(0, n).indexOf(10);
      chunks.push(Buffer.from(buf.subarray(0, nl === -1 ? n : nl)));
      total += n;
      if (nl !== -1 || total > 16 * 1024 * 1024) break;
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return null;
    }
  } finally {
    fs.closeSync(fd);
  }
}

function walk(dir, match, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, match, out);
    else if (e.isFile() && match(e.name)) out.push(p);
  }
  return out;
}

function mtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

// ---------- Claude Code adapter ----------

function claudeProjectDirs(cwd) {
  const root = path.join(process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude"), "projects");
  const slugs = [cwd.replace(/[^a-zA-Z0-9]/g, "-"), cwd.replace(/[/.]/g, "-")];
  return [...new Set(slugs)].map((s) => path.join(root, s));
}

function discoverClaude(opts, cwd) {
  if (opts.transcripts.length) {
    return opts.transcripts.map((p) => ({ path: path.resolve(p), role: p.includes(`${path.sep}subagents${path.sep}`) ? "subagent" : "main" }));
  }
  for (const dir of claudeProjectDirs(cwd)) {
    let files;
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    let main;
    if (opts.sessionId) {
      main = files.find((f) => f === `${opts.sessionId}.jsonl`);
    } else {
      main = files.map((f) => ({ f, t: mtime(path.join(dir, f)) })).sort((a, b) => b.t - a.t)[0]?.f;
    }
    if (!main) continue;
    const id = main.slice(0, -".jsonl".length);
    const sources = [{ path: path.join(dir, main), role: "main", session_id: id }];
    for (const p of walk(path.join(dir, id), (n) => n.endsWith(".jsonl")).sort()) sources.push({ path: p, role: "subagent" });
    if (!opts.sessionId) sources.others = files.filter((f) => f !== main).map((f) => path.join(dir, f));
    return sources;
  }
  return [];
}

async function readClaude(sources, win, counters) {
  const byId = new Map(); // message.id -> {model, usage, timestamp}
  let anon = 0;
  for (const src of sources) {
    src.records = 0;
    await forEachJsonl(src.path, (rec) => {
      const msg = rec.message;
      if (!msg || typeof msg !== "object" || !msg.usage || typeof msg.usage !== "object" || typeof msg.model !== "string" || !msg.model) return;
      if (msg.model === "<synthetic>") return;
      src.records++;
      const key = typeof msg.id === "string" && msg.id ? msg.id : `__anon${anon++}`;
      byId.delete(key); // keep the last occurrence
      byId.set(key, { model: msg.model, usage: msg.usage, timestamp: rec.timestamp });
    }, counters);
  }
  const models = {};
  for (const { model, usage, timestamp } of byId.values()) {
    if (!win.contains(timestamp)) continue;
    const m = (models[model] ??= blankUsage());
    const cc = usage.cache_creation && typeof usage.cache_creation === "object" ? usage.cache_creation : null;
    m.input += num(usage.input_tokens);
    m.output += num(usage.output_tokens);
    m.cache_read += num(usage.cache_read_input_tokens);
    if (cc && ("ephemeral_5m_input_tokens" in cc || "ephemeral_1h_input_tokens" in cc)) {
      m.cache_write_5m += num(cc.ephemeral_5m_input_tokens);
      m.cache_write_1h += num(cc.ephemeral_1h_input_tokens);
    } else {
      m.cache_write_5m += num(usage.cache_creation_input_tokens);
    }
    m.count++;
  }
  return { models, countKey: "messages", warnings: [] };
}

// ---------- Codex adapter ----------

function codexRoot() {
  return path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "sessions");
}

function codexMeta(file) {
  const rec = readFirstJsonLine(file);
  const p = rec && rec.type === "session_meta" && rec.payload && typeof rec.payload === "object" ? rec.payload : null;
  if (!p) return null;
  const spawn = p.source && p.source.subagent && p.source.subagent.thread_spawn;
  return {
    path: file,
    id: p.id ?? null,
    cwd: p.cwd ?? null,
    parent: p.parent_thread_id ?? p.forked_from_id ?? (spawn && spawn.parent_thread_id) ?? null,
    mtime: mtime(file),
  };
}

function discoverCodex(opts, cwd) {
  if (opts.transcripts.length) {
    return opts.transcripts.map((p) => ({ path: path.resolve(p), role: "main" }));
  }
  const metas = walk(codexRoot(), (n) => /^rollout-.*\.jsonl$/.test(n)).map(codexMeta).filter(Boolean);
  const candidates = metas.filter((m) => (opts.sessionId ? m.id === opts.sessionId : m.cwd === cwd && !m.parent));
  candidates.sort((a, b) => b.mtime - a.mtime);
  const main = candidates[0];
  if (!main) return [];
  const sources = [{ path: main.path, role: "main", session_id: main.id }];
  if (main.id) {
    for (const m of metas.filter((x) => x.parent === main.id).sort((a, b) => a.path.localeCompare(b.path))) {
      sources.push({ path: m.path, role: "subagent" });
    }
  }
  if (!opts.sessionId) sources.others = candidates.slice(1).map((m) => m.path);
  return sources;
}

async function readCodex(sources, win, counters) {
  const models = {};
  const warnings = [];
  let tokenEvents = 0;
  for (const src of sources) {
    src.records = 0;
    let model = null;
    let metaModel = null;
    let prev = null;
    await forEachJsonl(src.path, (rec) => {
      const p = rec.payload && typeof rec.payload === "object" ? rec.payload : null;
      if (!p) return;
      if (rec.type === "session_meta") {
        if (typeof p.model === "string") metaModel = p.model;
      } else if (rec.type === "turn_context") {
        if (typeof p.model === "string" && p.model) model = p.model;
      } else if (rec.type === "event_msg" && p.type === "token_count") {
        const total = p.info && typeof p.info === "object" ? p.info.total_token_usage : null;
        if (!total || typeof total !== "object") return;
        tokenEvents++;
        const cur = {
          input: num(total.input_tokens),
          cached: num(total.cached_input_tokens),
          output: num(total.output_tokens),
          reasoning: num(total.reasoning_output_tokens),
          write: num(total.cache_write_input_tokens),
        };
        let delta = { ...cur };
        if (prev) {
          const reset = cur.input < prev.input || cur.output < prev.output || cur.cached < prev.cached;
          if (!reset) for (const k of Object.keys(cur)) delta[k] = cur[k] - prev[k];
        }
        prev = cur;
        if (!win.contains(rec.timestamp)) return;
        if (!delta.input && !delta.output && !delta.cached && !delta.reasoning && !delta.write) return;
        const name = model ?? metaModel ?? "unknown";
        const m = (models[name] ??= blankUsage());
        m.input += Math.max(0, delta.input - delta.cached);
        m.output += Math.max(0, delta.output);
        m.reasoning_output += Math.max(0, delta.reasoning);
        m.cache_read += Math.max(0, delta.cached);
        m.cache_write_5m += Math.max(0, delta.write);
        m.count++;
        src.records++;
      }
    }, counters);
  }
  if (!tokenEvents) warnings.push("no token_count events with info found; the rollout format may have changed or the session has no model calls");
  if (models.unknown) warnings.push("some token events had no preceding turn_context model; attributed to 'unknown'");
  return { models, countKey: "events", warnings };
}

// Main transcripts other than the chosen one that have usage records inside the window.
async function otherSessionsInWindow(others, harness, win, counters) {
  const found = [];
  for (const file of others) {
    let hit = false;
    await forEachJsonl(file, (rec) => {
      if (hit || !win.contains(rec.timestamp)) return;
      const p = rec.payload && typeof rec.payload === "object" ? rec.payload : null;
      hit = harness === "claude" ? !!(rec.message && typeof rec.message === "object" && rec.message.usage && rec.message.model !== "<synthetic>") : !!(rec.type === "event_msg" && p && p.type === "token_count" && p.info);
    }, counters);
    if (hit) found.push(file);
  }
  return found;
}

// ---------- pricing and output ----------

function loadPrices(file) {
  const table = {};
  for (const [k, v] of Object.entries(BUILTIN_PRICES)) table[k] = { ...v };
  if (!file) return table;
  let user;
  try {
    user = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    throw new UsageError(`cannot read --prices ${file}: ${e.message}`);
  }
  if (!user || typeof user !== "object" || Array.isArray(user)) throw new UsageError("--prices must be a JSON object keyed by model id");
  for (const [k, v] of Object.entries(user)) {
    if (v && typeof v === "object") table[k] = { ...(table[k] ?? {}), ...v };
  }
  return table;
}

function priceFor(table, model) {
  if (table[model]) return table[model];
  // Tolerate a trailing date or [1m]-style suffix: longest known id that prefixes the model.
  const base = Object.keys(table)
    .filter((k) => model.startsWith(k) && /^[-@\[:_]/.test(model.slice(k.length)))
    .sort((a, b) => b.length - a.length)[0];
  return base ? table[base] : null;
}

function costOf(usage, price) {
  if (!price) return null;
  let sum = 0;
  for (const f of TOKEN_FIELDS) {
    if (!usage[f]) continue;
    if (typeof price[f] !== "number") return null;
    sum += (usage[f] * price[f]) / 1e6;
  }
  return Math.round(sum * 1e6) / 1e6;
}

function shape(usage, countKey, harness, cost) {
  const out = { input: usage.input, output: usage.output };
  if (harness === "codex") out.reasoning_output = usage.reasoning_output;
  else out.reasoning_output = 0;
  out.cache_read = usage.cache_read;
  out.cache_write_5m = usage.cache_write_5m;
  out.cache_write_1h = usage.cache_write_1h;
  out[countKey] = usage.count;
  out.cost_usd = cost;
  return out;
}

function detectHarness(opts, cwd) {
  const claude = discoverClaude({ ...opts, transcripts: [] }, cwd);
  const codex = discoverCodex({ ...opts, transcripts: [] }, cwd);
  if (claude.length && codex.length) return mtime(codex[0].path) > mtime(claude[0].path) ? "codex" : "claude";
  if (claude.length) return "claude";
  if (codex.length) return "codex";
  return null;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    process.stdout.write(helpText());
    return;
  }
  const cwd = path.resolve(opts.cwd ?? process.cwd());
  const prices = loadPrices(opts.prices);
  const win = makeWindow(opts);

  let harness = opts.harness;
  if (harness === "auto") {
    if (opts.transcripts.length) {
      // Sniff the first line: Codex rollouts start with session_meta.
      const first = fs.existsSync(opts.transcripts[0]) ? readFirstJsonLine(opts.transcripts[0]) : null;
      harness = first && first.type === "session_meta" ? "codex" : "claude";
    } else {
      harness = detectHarness(opts, cwd);
      if (!harness) throw new UsageError(`no Claude Code or Codex transcript found for ${cwd}`);
    }
  }

  const sources = harness === "claude" ? discoverClaude(opts, cwd) : discoverCodex(opts, cwd);
  if (!sources.length) throw new UsageError(`no ${harness} transcript found for ${cwd}`);
  for (const s of sources) {
    if (!fs.existsSync(s.path)) throw new UsageError(`transcript not found: ${s.path}`);
  }

  const counters = { skipped_lines: 0 };
  const { models: raw, countKey, warnings } = harness === "claude" ? await readClaude(sources, win, counters) : await readCodex(sources, win, counters);

  if (sources.others?.length) {
    const found = await otherSessionsInWindow(sources.others, harness, win, { skipped_lines: 0 });
    if (found.length) warnings.push(`--session-id not given and ${found.length} other main transcript(s) in the same folder have usage inside the window (e.g. ${found[0]}); the newest by modification time was used, which may not be this session. Rerun with --session-id`);
  }

  const models = {};
  const total = blankUsage();
  let totalCost = 0;
  let complete = true;
  for (const name of Object.keys(raw).sort()) {
    const u = raw[name];
    const cost = costOf(u, priceFor(prices, name));
    if (cost === null) complete = false;
    else totalCost += cost;
    models[name] = shape(u, countKey, harness, cost);
    for (const k of Object.keys(total)) total[k] += u[k];
  }
  const totals = shape(total, countKey, harness, complete ? Math.round(totalCost * 1e6) / 1e6 : null);
  totals.cost_usd_known = Math.round(totalCost * 1e6) / 1e6; // priced models only
  totals.cost_complete = complete;

  const result = {
    harness,
    session_id: sources.find((s) => s.session_id)?.session_id ?? null,
    window: { since: win.since, until: win.until },
    sources: sources.map((s) => ({ path: s.path, role: s.role, records: s.records })),
    models,
    totals,
    prices_as_of: PRICES_AS_OF,
    skipped_lines: counters.skipped_lines,
    format_warnings: warnings,
  };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((e) => {
  if (e instanceof UsageError) {
    process.stderr.write(`usage-report: ${e.message}\n`);
    process.exit(2);
  }
  process.stderr.write(`usage-report: ${e && e.stack ? e.stack : e}\n`);
  process.exit(1);
});

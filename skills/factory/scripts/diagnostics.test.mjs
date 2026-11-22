#!/usr/bin/env node
// Node 18+. Sample-based checks for the launch log, per-source usage and Diagnostics block:
//   node scripts/diagnostics.test.mjs
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "factory-diag-"));
const since = "2026-11-22T10:00:00Z";
const until = "2026-11-22T11:00:00Z";

function node(script, args) {
  const result = spawnSync(process.execPath, [path.join(here, script), ...args], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

const factory = (...args) => JSON.parse(node("factory.mjs", args));
const jsonl = (file, records) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, records.map((record) => JSON.stringify(record)).join("\n") + "\n");
};

function claudeMessage(id, model, input, output, minute) {
  return { timestamp: `2026-11-22T10:${String(minute).padStart(2, "0")}:00Z`,
    message: { id, model, usage: { input_tokens: input, output_tokens: output } } };
}

function log(file, stage) {
  factory("agent", "add", "--file", file, "--stage", stage, "--id", "1", "--role", "Review owner",
    "--model", "sonnet", "--effort", "medium", "--run", "run1");
  const owner = path.join(dir, `owner-${path.basename(file)}`);
  factory("agent", "add", "--file", owner, "--stage", stage, "--id", "2", "--parent", "1", "--role", "Reviewer",
    "--model", "opus", "--effort", "high", "--run", "run1");
  factory("agent", "done", "--file", owner, "--id", "2", "--work", "3 findings (#1-#3)");
  factory("agent", "add", "--file", owner, "--stage", stage, "--id", "3", "--parent", "1", "--role", "verify-and-fix",
    "--model", "opus", "--effort", "high", "--run", "run1");
  factory("agent", "done", "--file", owner, "--id", "3", "--work", "#1 VALID abc1234", "--stopped");
  factory("agent", "done", "--file", file, "--id", "1", "--work", "round procedure");
  assert.equal(factory("agent", "merge", "--file", file, "--from", owner).added, 2);
}

function diagnostics(usage, checkpoint, mode, extra = []) {
  const out = path.join(dir, `diag-${Math.random().toString(36).slice(2)}.md`);
  const result = factory("diagnostics", "--stage", "Review Round 1", "--usage", usage, "--agents", checkpoint,
    "--mode", mode, "--work", "preflight, publish review", "--out", out, ...extra);
  return { result, block: fs.readFileSync(out, "utf8") };
}

test("Claude Code: agents matched by meta.json label, unlabeled usage unattributed", () => {
  const root = path.join(dir, "claude");
  const main = path.join(root, "s1.jsonl");
  jsonl(main, [claudeMessage("m1", "claude-sonnet-5-5", 1000, 100, 1)]);
  const sub = (name, label, model, tokens, requested) => {
    const file = path.join(root, "s1", "subagents", `agent-${name}.jsonl`);
    jsonl(file, [claudeMessage(`${name}-1`, model, tokens, 10, 5)]);
    if (label) fs.writeFileSync(file.replace(/\.jsonl$/, ".meta.json"), JSON.stringify({ description: `${label} work`, model: requested }));
    return file;
  };
  const files = [main,
    sub("a", "factory:run1:1", "claude-sonnet-5-5", 2000, "sonnet"),
    sub("b", "factory:run1:2", "claude-sonnet-5-5", 3000, "opus"),
    sub("c", "factory:run1:3", "claude-opus-5-5", 4000, "opus"),
    sub("d", null, "claude-haiku-5-5", 500, null)];
  const usage = path.join(dir, "claude-usage.json");
  fs.writeFileSync(usage, node("usage-report.mjs", ["--harness", "claude", "--since", since, "--until", until,
    ...files.flatMap((file) => ["--transcript", file])]));
  const report = JSON.parse(fs.readFileSync(usage, "utf8"));
  assert.deepEqual(report.by_source.map((source) => source.label), [null, "factory:run1:1", "factory:run1:2", "factory:run1:3", null]);
  const checkpoint = path.join(dir, "claude-checkpoint.json");
  log(checkpoint, "Review Round 1");
  const { result, block } = diagnostics(usage, checkpoint, "nested");
  assert.equal(result.available, true);
  assert.match(block, /<summary>Diagnostics — Review Round 1 · nested · 3 agents · \$/);
  assert.match(block, /\| 1 \| Orchestrator \| — \| claude-sonnet-5-5 · — \| preflight, publish review \| 1k \|/);
  assert.match(block, /\| 2 \| Review owner \| 1 \| claude-sonnet-5-5 · medium \| round procedure \| 2k \|/);
  assert.match(block, /\| 3 \| Reviewer \| 2 \| claude-sonnet-5-5 \(asked opus\) · high \| 3 findings/);
  assert.match(block, /\| 4 \| verify-and-fix \| 2 \| claude-opus-5-5 · high \| stopped: #1 VALID abc1234 \|/);
  assert.match(block, /\|  \| Unattributed \|  \| claude-haiku-5-5 \|/);
  assert.match(block, /\*\*Total\*\* \|  \|  \|  \| \*\*11k\*\*/);
});

test("Codex: labels found in the rollout, cost N/A without prices", () => {
  const root = path.join(dir, "codex");
  const tokens = (minute, input, output) => ({ timestamp: `2026-11-22T10:${minute}:00Z`, type: "event_msg",
    payload: { type: "token_count", info: { total_token_usage: { input_tokens: input, output_tokens: output, cached_input_tokens: 0 } } } });
  const main = path.join(root, "rollout-main.jsonl");
  jsonl(main, [
    { timestamp: "2026-11-22T10:00:00Z", type: "session_meta", payload: { id: "main1", cwd: dir } },
    { timestamp: "2026-11-22T10:00:01Z", type: "turn_context", payload: { model: "terra" } },
    tokens("01", 1000, 100)]);
  const sub = path.join(root, "rollout-sub.jsonl");
  jsonl(sub, [
    { timestamp: "2026-11-22T10:02:00Z", type: "session_meta", payload: { id: "sub1", parent_thread_id: "main1", timestamp: "2026-11-22T10:02:00Z" } },
    { timestamp: "2026-11-22T10:02:01Z", type: "response_item", payload: { type: "message", role: "user", content: [{ type: "input_text", text: "factory:run1:1\nRun the round." }] } },
    { timestamp: "2026-11-22T10:02:02Z", type: "turn_context", payload: { model: "terra" } },
    tokens("03", 2000, 200)]);
  const usage = path.join(dir, "codex-usage.json");
  fs.writeFileSync(usage, node("usage-report.mjs", ["--harness", "codex", "--since", since, "--until", until,
    "--transcript", main, "--transcript", sub]));
  const checkpoint = path.join(dir, "codex-checkpoint.json");
  factory("agent", "add", "--file", checkpoint, "--stage", "Review Round 1", "--id", "1", "--role", "Review owner",
    "--model", "terra", "--effort", "medium", "--run", "run1");
  const { block } = diagnostics(usage, checkpoint, "nested");
  assert.match(block, /\| 1 \| Orchestrator \| — \| terra · — \| preflight, publish review \| 1k \| N\/A \|/);
  assert.match(block, /\| 2 \| Review owner \| 1 \| terra · medium \| running \| 2k \| N\/A \|/);
  assert.match(block, /\*\*N\/A\*\* \|\n/);
});

test("unreadable usage still shows the tree, models and work", () => {
  const usage = path.join(dir, "bad-usage.json");
  fs.writeFileSync(usage, JSON.stringify({ error: "no transcript for this session" }));
  const checkpoint = path.join(dir, "bad-checkpoint.json");
  log(checkpoint, "Review Round 1");
  const { result, block } = diagnostics(usage, checkpoint, "flat");
  assert.equal(result.available, false);
  assert.match(block, /- Usage: N\/A \(no transcript for this session\)/);
  assert.match(block, /\| 3 \| Reviewer \| 2 \| opus · high \| 3 findings \(#1-#3\) \| N\/A \| N\/A \|/);
});

test("inline mode and unlogged stages", () => {
  const usage = path.join(dir, "bad-usage.json");
  const checkpoint = path.join(dir, "empty-checkpoint.json");
  fs.writeFileSync(checkpoint, "{}");
  assert.match(diagnostics(usage, checkpoint, "inline").block, /- Mode: inline \(no subagents\)/);
  const out = path.join(dir, "plain.md");
  factory("diagnostics", "--stage", "Build", "--usage", usage, "--out", out);
  assert.equal(fs.readFileSync(out, "utf8"), "Diagnostics unavailable: no transcript for this session\n");
});

test("agent log rejects duplicates and unknown IDs", () => {
  const file = path.join(dir, "dupes.json");
  factory("agent", "add", "--file", file, "--stage", "Build", "--id", "1", "--role", "Builder", "--model", "sonnet", "--effort", "high");
  const label = JSON.parse(fs.readFileSync(file, "utf8")).agents[0].label;
  assert.match(label, /^factory:[a-z0-9]{8}:1$/);
  for (const args of [["add", "--file", file, "--stage", "Build", "--id", "1", "--role", "B", "--model", "m", "--effort", "low"],
    ["done", "--file", file, "--id", "9", "--work", "x"]]) {
    const result = spawnSync(process.execPath, [path.join(here, "factory.mjs"), "agent", ...args], { encoding: "utf8" });
    assert.equal(result.status, 2, result.stderr);
  }
});

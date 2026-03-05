#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseUrlRaw = (process.env.CODEX_BRIDGE_URL ?? "").trim();
const token = (process.env.CODEX_BRIDGE_TOKEN ?? "").trim();
const promptRaw = (process.env.CODEX_BRIDGE_PROMPT ?? "").trim();
const prompt = promptRaw || process.argv.slice(2).join(" ").trim();
const cwd = (process.env.CODEX_BRIDGE_CWD ?? "").trim();
const model = (process.env.CODEX_BRIDGE_MODEL ?? "").trim();
const sessionPrefix = (process.env.CODEX_BRIDGE_SESSION_PREFIX ?? "codex").trim() || "codex";

function fail(payload, exitCode = 1) {
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exit(exitCode);
}

if (!baseUrlRaw) {
  fail({ ok: false, error: "CODEX_BRIDGE_URL missing" }, 2);
}
if (!token) {
  fail({ ok: false, error: "CODEX_BRIDGE_TOKEN missing" }, 2);
}
if (!prompt) {
  fail({ ok: false, error: "prompt missing (set CODEX_BRIDGE_PROMPT or pass args)" }, 2);
}

const baseUrl = baseUrlRaw.replace(/\/+$/, "");
const url = `${baseUrl}/run`;
const body = {
  prompt,
  ...(cwd ? { cwd } : {}),
  ...(model ? { model } : {}),
  desiredSessionPrefix: sessionPrefix,
};

let res;
let text = "";
try {
  res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  text = await res.text();
} catch (err) {
  fail({ ok: false, error: String(err) });
}

let json;
try {
  json = text ? JSON.parse(text) : null;
} catch {
  json = null;
}

if (!res.ok) {
  fail({
    ok: false,
    status: res.status,
    error: typeof json?.error === "string" ? json.error : "request failed",
    body: json ?? text.slice(0, 2000),
  });
}

const jobId = typeof json?.jobId === "string" ? json.jobId.trim() : "";
if (!jobId) {
  fail({ ok: false, error: "missing jobId in response", body: json ?? text.slice(0, 2000) });
}

const jobSessionKey = `${sessionPrefix}:${jobId}`;
let logPath = "";
try {
  const cwdNow = process.cwd();
  const logsDir = path.join(cwdNow, "memory", "codex-jobs");
  fs.mkdirSync(logsDir, { recursive: true });
  logPath = path.join(logsDir, `${jobId}.md`);
  const ts = new Date().toISOString();
  const lines = [
    `# Codex Job ${jobId}`,
    "",
    `- createdAt: ${ts}`,
    `- sessionKey: ${jobSessionKey}`,
    `- status: submitted`,
    cwd ? `- cwd: ${cwd}` : "- cwd: (default)",
    model ? `- model: ${model}` : "- model: (default)",
    "",
    "## User Prompt",
    "",
    prompt,
    "",
    "## Final Summary",
    "",
    "(pending)",
    "",
  ];
  fs.writeFileSync(logPath, `${lines.join("\n")}`, "utf8");
} catch {
}

try {
  const watchScript = path.join(__dirname, "codex-bridge-watch.mjs");
  spawn(process.execPath, [watchScript], {
    detached: true,
    stdio: "ignore",
    env: {
      ...process.env,
      CODEX_BRIDGE_URL: baseUrl,
      CODEX_BRIDGE_TOKEN: token,
      CODEX_WATCH_JOB_ID: jobId,
      CODEX_WATCH_LOG_PATH: logPath,
    },
  }).unref();
} catch {
}

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    jobId,
    jobSessionKey,
    statusUrl: `${baseUrl}/jobs/${jobId}`,
  })}\n`,
);

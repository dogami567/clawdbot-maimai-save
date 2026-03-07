#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  artifactDirForJob,
  ensureJobsMemoryDir,
  jobLogPath,
  promptPreview,
  upsertJobIndex,
} from "./codex-bridge-common.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const baseUrlRaw = (process.env.CODEX_BRIDGE_URL ?? "").trim();
const token = (process.env.CODEX_BRIDGE_TOKEN ?? "").trim();
const promptRaw = (process.env.CODEX_BRIDGE_PROMPT ?? "").trim();
const prompt = promptRaw || process.argv.slice(2).join(" ").trim();
const cwd = (process.env.CODEX_BRIDGE_CWD ?? "").trim();
const model = (process.env.CODEX_BRIDGE_MODEL ?? "").trim();
const sessionPrefix = (process.env.CODEX_BRIDGE_SESSION_PREFIX ?? "codex").trim() || "codex";
const callbackChannel = (process.env.CLAWDBOT_MESSAGE_PROVIDER ?? "").trim();
const callbackTo = (process.env.CLAWDBOT_MESSAGE_TO ?? "").trim();
const callbackThreadId = (process.env.CLAWDBOT_MESSAGE_THREAD_ID ?? "").trim();
const callbackAccountId = (process.env.CLAWDBOT_MESSAGE_ACCOUNT_ID ?? "").trim();
const originSessionKey = (process.env.CLAWDBOT_SESSION_KEY ?? "").trim();

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
  ...(callbackChannel ? { callbackChannel } : {}),
  ...(callbackTo ? { callbackTo } : {}),
  ...(callbackThreadId ? { callbackThreadId } : {}),
  ...(callbackAccountId ? { callbackAccountId } : {}),
  ...(originSessionKey ? { originSessionKey } : {}),
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

const jobSessionKey =
  (typeof json?.sessionKey === "string" && json.sessionKey.trim()) || `${sessionPrefix}:${jobId}`;
const cwdNow = process.cwd();
const logsDir = ensureJobsMemoryDir(cwdNow);
const logPath = jobLogPath(jobId, cwdNow);
const artifactPath = artifactDirForJob(jobId);
const createdAt = new Date().toISOString();
const preview = promptPreview(prompt, 260);

try {
  const lines = [
    `# Codex Job ${jobId}`,
    "",
    `- createdAt: ${createdAt}`,
    `- sessionKey: ${jobSessionKey}`,
    `- status: queued`,
    cwd ? `- cwd: ${cwd}` : "- cwd: (default)",
    model ? `- model: ${model}` : "- model: (default)",
    `- statusUrl: ${baseUrl}/jobs/${jobId}`,
    `- artifactPath: ${artifactPath}`,
    "",
    "## User Prompt",
    "",
    prompt,
    "",
    "## Status",
    "",
    "- state: queued",
    "- outcome: queued",
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
  upsertJobIndex(
    {
      jobId,
      sessionKey: jobSessionKey,
      createdAt,
      status: "queued",
      outcome: "queued",
      cwd: cwd || null,
      model: model || null,
      promptPreview: preview,
      promptLength: prompt.length,
      statusUrl: `${baseUrl}/jobs/${jobId}`,
      artifactPath,
      logPath,
      source: "bridge-submit",
    },
    cwdNow,
  );
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
      CODEX_WATCH_INDEX_DIR: logsDir,
    },
  }).unref();
} catch {
}

process.stdout.write(
  `${JSON.stringify({
    ok: true,
    jobId,
    jobSessionKey,
    sessionKey: jobSessionKey,
    statusUrl: `${baseUrl}/jobs/${jobId}`,
    artifactPath,
    logPath,
    cwd: cwd || null,
    model: model || null,
    promptPreview: preview,
    statusQuery: {
      latest: "node ./scripts/codex-status.mjs --latest",
      recent: "node ./scripts/codex-status.mjs --limit 5",
      byJob: `node ./scripts/codex-status.mjs --job ${jobId}`,
    },
  })}\n`,
);

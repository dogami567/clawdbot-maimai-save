#!/usr/bin/env node
import fs from "node:fs";
import {
  isTerminalStatus,
  mergeJobSnapshot,
  readJobsIndex,
  upsertJobIndex,
} from "./codex-bridge-common.mjs";

const baseUrlRaw = (process.env.CODEX_BRIDGE_URL ?? "").trim();
const token = (process.env.CODEX_BRIDGE_TOKEN ?? "").trim();
const jobId = (process.env.CODEX_WATCH_JOB_ID ?? "").trim();
const logPath = (process.env.CODEX_WATCH_LOG_PATH ?? "").trim();
const maxWaitMs = Number(process.env.CODEX_WATCH_MAX_WAIT_MS ?? 30 * 60 * 1000);
const intervalMs = Number(process.env.CODEX_WATCH_INTERVAL_MS ?? 8000);
const baseDir = process.cwd();

if (!jobId || !logPath) {
  process.exit(0);
}

const baseUrl = baseUrlRaw.replace(/\/+$/, "");

function replaceSection(markdown, heading, body) {
  const block = `${heading}\n\n${body.trimEnd()}\n`;
  const start = markdown.indexOf(`${heading}\n`);
  if (start >= 0) {
    const nextHeading = markdown.indexOf("\n## ", start + heading.length + 1);
    const prefix = markdown.slice(0, start);
    const suffix = nextHeading >= 0 ? markdown.slice(nextHeading + 1) : "";
    return `${prefix}${block}${suffix ? `\n${suffix}` : ""}`.trimEnd();
  }
  return `${markdown.trimEnd()}\n\n${block}`;
}

function updateLog(job) {
  const statusBlock = [
    `- state: ${job.status ?? "unknown"}`,
    `- outcome: ${job.outcome ?? "unknown"}`,
    `- exitCode: ${job.exitCode ?? "(none)"}`,
    `- createdAt: ${job.createdAt ?? "(unknown)"}`,
    `- startedAt: ${job.startedAt ?? "(unknown)"}`,
    `- finishedAt: ${job.finishedAt ?? "(pending)"}`,
    `- cwd: ${job.cwd ?? "(default)"}`,
    `- model: ${job.model ?? "(default)"}`,
    `- statusUrl: ${job.statusUrl ?? "(none)"}`,
    `- artifactPath: ${job.artifactPath ?? "(none)"}`,
    `- notifyStatus: ${job.notifyStatus ?? "(none)"}`,
    `- notifyError: ${job.notifyError ?? "(none)"}`,
  ].join("\n");

  const finalLines = [
    `- result: ${job.lastMessagePreview || "(no last message)"}`,
    job.stderrPreview ? `- stderr: ${job.stderrPreview}` : "",
    job.stdoutPreview && !job.lastMessagePreview ? `- stdout: ${job.stdoutPreview}` : "",
    job.files?.jobJsonPath ? `- jobJson: ${job.files.jobJsonPath}` : "",
    job.files?.lastMessagePath ? `- lastMessageFile: ${job.files.lastMessagePath}` : "",
    job.files?.stdoutPath ? `- stdoutFile: ${job.files.stdoutPath}` : "",
    job.files?.stderrPath ? `- stderrFile: ${job.files.stderrPath}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  let existing = "";
  try {
    existing = fs.readFileSync(logPath, "utf8");
  } catch {
  }

  if (!existing) {
    existing = `# Codex Job ${jobId}\n`;
  }

  let next = replaceSection(existing, "## Status", statusBlock);
  next = replaceSection(next, "## Final Summary", finalLines || "- result: (pending)");
  fs.writeFileSync(logPath, next.endsWith("\n") ? next : `${next}\n`, "utf8");
}

async function fetchJob() {
  if (!baseUrl || !token) {
    return null;
  }
  const response = await fetch(`${baseUrl}/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`jobs endpoint ${response.status}: ${text.slice(0, 300)}`);
  }
  const json = text ? JSON.parse(text) : null;
  return json?.job ?? null;
}

function findIndexEntry() {
  return readJobsIndex(baseDir).find((job) => job?.jobId === jobId) ?? null;
}

function persistSnapshot(remoteJob = null) {
  const snapshot = mergeJobSnapshot({
    jobId,
    indexEntry: findIndexEntry(),
    remoteJob,
    statusUrl: baseUrl ? `${baseUrl}/jobs/${jobId}` : null,
  });
  try {
    upsertJobIndex(snapshot, baseDir);
  } catch {
  }
  try {
    updateLog(snapshot);
  } catch {
  }
  return snapshot;
}

async function run() {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    let remoteJob = null;
    try {
      remoteJob = await fetchJob();
    } catch {
    }

    const snapshot = persistSnapshot(remoteJob);
    if (isTerminalStatus(snapshot.status)) {
      if (remoteJob) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        try {
          const refreshed = await fetchJob();
          persistSnapshot(refreshed);
        } catch {
          persistSnapshot(null);
        }
      }
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  persistSnapshot(null);
}

await run();

#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const baseUrlRaw = (process.env.CODEX_BRIDGE_URL ?? "").trim();
const token = (process.env.CODEX_BRIDGE_TOKEN ?? "").trim();
const jobId = (process.env.CODEX_WATCH_JOB_ID ?? "").trim();
const logPath = (process.env.CODEX_WATCH_LOG_PATH ?? "").trim();
const maxWaitMs = Number(process.env.CODEX_WATCH_MAX_WAIT_MS ?? 30 * 60 * 1000);
const intervalMs = Number(process.env.CODEX_WATCH_INTERVAL_MS ?? 8000);

if (!baseUrlRaw || !token || !jobId || !logPath) {
  process.exit(0);
}

const baseUrl = baseUrlRaw.replace(/\/+$/, "");

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function updateLog(job) {
  ensureDir(logPath);
  const finishedAt = job.finishedAtMs ? new Date(job.finishedAtMs).toISOString() : new Date().toISOString();
  const summaryLines = [
    `- status: ${job.status ?? "unknown"}`,
    `- finishedAt: ${finishedAt}`,
    `- exitCode: ${job.exitCode ?? "(none)"}`,
    `- notifyStatus: ${job.notifyStatus ?? "(none)"}`,
    `- notifyError: ${job.notifyError ?? "(none)"}`,
  ];
  if (typeof job.lastMessage === "string" && job.lastMessage.trim()) {
    summaryLines.push(`- message: ${job.lastMessage.trim().replace(/\s+/g, " ").slice(0, 600)}`);
  }

  const finalBlock = `${summaryLines.join("\n")}`;
  let existing = "";
  try {
    existing = fs.readFileSync(logPath, "utf8");
  } catch {
  }

  if (!existing) {
    fs.writeFileSync(logPath, `# Codex Job ${jobId}\n\n## Final Summary\n\n${finalBlock}\n`, "utf8");
    return;
  }

  if (existing.includes("## Final Summary")) {
    const replaced = existing.replace(/## Final Summary[\s\S]*$/m, `## Final Summary\n\n${finalBlock}\n`);
    fs.writeFileSync(logPath, replaced, "utf8");
    return;
  }

  fs.writeFileSync(logPath, `${existing.trimEnd()}\n\n## Final Summary\n\n${finalBlock}\n`, "utf8");
}

async function fetchJob() {
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

async function run() {
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    try {
      const job = await fetchJob();
      if (job && ["completed", "failed", "canceled", "cancelled", "error"].includes(String(job.status).toLowerCase())) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        let finalJob = job;
        try {
          const refreshed = await fetchJob();
          if (refreshed) finalJob = refreshed;
        } catch {
        }
        updateLog(finalJob);
        return;
      }
    } catch {
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

await run();

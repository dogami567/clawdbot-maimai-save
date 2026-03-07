#!/usr/bin/env node
import {
  mergeJobSnapshot,
  readJobsIndex,
} from "./codex-bridge-common.mjs";

const baseUrlRaw = (process.env.CODEX_BRIDGE_URL ?? "").trim();
const token = (process.env.CODEX_BRIDGE_TOKEN ?? "").trim();
const baseUrl = baseUrlRaw.replace(/\/+$/, "");
const baseDir = process.cwd();

function fail(error, exitCode = 1) {
  process.stderr.write(`${JSON.stringify({ ok: false, error })}\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  let jobId = "";
  let limit = 5;
  let latest = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--job") {
      jobId = (argv[i + 1] ?? "").trim();
      i += 1;
      continue;
    }
    if (arg === "--limit") {
      const raw = argv[i + 1] ?? "";
      const parsed = Number(raw);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        fail(`invalid --limit value: ${raw}`, 2);
      }
      limit = parsed;
      i += 1;
      continue;
    }
    if (arg === "--latest") {
      latest = true;
      limit = 1;
      continue;
    }
    fail(`unknown argument: ${arg}`, 2);
  }

  if (!jobId && !latest && argv.length === 0) {
    latest = true;
    limit = 1;
  }

  return { jobId, limit, latest };
}

async function fetchJob(jobId) {
  if (!baseUrl || !token) {
    return null;
  }

  const response = await fetch(`${baseUrl}/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) {
    return null;
  }
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`jobs endpoint ${response.status}: ${text.slice(0, 300)}`);
  }
  const json = text ? JSON.parse(text) : null;
  return json?.job ?? null;
}

function selectEntries({ jobId, limit }) {
  const index = readJobsIndex(baseDir);
  if (jobId) {
    const found = index.find((job) => job?.jobId === jobId);
    return found ? [found] : [{ jobId }];
  }
  return index.slice(0, limit);
}

async function buildSnapshot(indexEntry) {
  const jobId = `${indexEntry?.jobId ?? ""}`.trim();
  if (!jobId) {
    return null;
  }

  let remoteJob = null;
  let remoteError = null;
  try {
    remoteJob = await fetchJob(jobId);
  } catch (error) {
    remoteError = String(error);
  }

  const snapshot = mergeJobSnapshot({
    jobId,
    indexEntry,
    remoteJob,
    statusUrl: baseUrl ? `${baseUrl}/jobs/${jobId}` : null,
  });
  if (remoteError) {
    snapshot.remoteError = remoteError;
  }
  return snapshot;
}

const query = parseArgs(process.argv.slice(2));
const entries = selectEntries(query);

if (query.jobId && !entries.length) {
  fail(`job not found: ${query.jobId}`, 3);
}

const snapshots = (await Promise.all(entries.map((entry) => buildSnapshot(entry)))).filter(Boolean);

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      query: {
        mode: query.jobId ? "job" : query.latest ? "latest" : "recent",
        jobId: query.jobId || null,
        limit: query.jobId ? 1 : query.limit,
      },
      count: snapshots.length,
      jobs: snapshots,
      job: query.jobId ? snapshots[0] ?? null : null,
    },
    null,
    2,
  )}\n`,
);

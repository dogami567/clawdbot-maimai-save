#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const hostJobsDirRaw = (process.env.CODEX_BRIDGE_HOST_JOBS_DIR ?? "").trim();

export const hostJobsDir = (hostJobsDirRaw || "/home/node/codex-jobs").replace(/\\/g, "/");

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

export function jobsMemoryDir(baseDir = process.cwd()) {
  return path.join(baseDir, "memory", "codex-jobs");
}

export function jobsIndexPath(baseDir = process.cwd()) {
  return path.join(jobsMemoryDir(baseDir), "index.json");
}

export function jobLogPath(jobId, baseDir = process.cwd()) {
  return path.join(jobsMemoryDir(baseDir), `${jobId}.md`);
}

export function ensureJobsMemoryDir(baseDir = process.cwd()) {
  const dirPath = jobsMemoryDir(baseDir);
  ensureDir(dirPath);
  return dirPath;
}

export function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

export function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function readJobsIndex(baseDir = process.cwd()) {
  const indexPath = jobsIndexPath(baseDir);
  const value = readJsonFile(indexPath, []);
  return Array.isArray(value) ? value : [];
}

function toTimestamp(value) {
  if (typeof value !== "string" || !value.trim()) {
    return 0;
  }
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : 0;
}

function sortJobs(jobs) {
  return [...jobs].sort((a, b) => {
    const aTime = toTimestamp(a?.createdAt) || toTimestamp(a?.updatedAt);
    const bTime = toTimestamp(b?.createdAt) || toTimestamp(b?.updatedAt);
    return bTime - aTime;
  });
}

export function upsertJobIndex(record, baseDir = process.cwd()) {
  const jobs = readJobsIndex(baseDir);
  const next = {
    ...record,
    updatedAt: new Date().toISOString(),
  };
  const index = jobs.findIndex((job) => job?.jobId === next.jobId);
  if (index >= 0) {
    jobs[index] = {
      ...jobs[index],
      ...next,
    };
  } else {
    jobs.push(next);
  }
  const sorted = sortJobs(jobs);
  writeJsonFile(jobsIndexPath(baseDir), sorted);
  return sorted.find((job) => job?.jobId === next.jobId) ?? next;
}

export function truncateText(text, limit = 600) {
  if (typeof text !== "string") {
    return "";
  }
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) {
    return "";
  }
  if (compact.length <= limit) {
    return compact;
  }
  return `${compact.slice(0, Math.max(0, limit - 1))}...`;
}

export function promptPreview(prompt, limit = 220) {
  return truncateText(prompt, limit);
}

export function artifactDirForJob(jobId) {
  return path.posix.join(hostJobsDir, jobId);
}

function readTextFile(filePath) {
  try {
    return fs.readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

export function readArtifactState(jobId) {
  const artifactPath = artifactDirForJob(jobId);
  const jobJsonPath = path.posix.join(artifactPath, "job.json");
  const lastMessagePath = path.posix.join(artifactPath, "last_message.txt");
  const stdoutPath = path.posix.join(artifactPath, "stdout.txt");
  const stderrPath = path.posix.join(artifactPath, "stderr.txt");

  const job = readJsonFile(jobJsonPath, null);
  const lastMessage = readTextFile(lastMessagePath);
  const stdout = readTextFile(stdoutPath);
  const stderr = readTextFile(stderrPath);

  return {
    artifactPath,
    files: {
      jobJsonPath,
      lastMessagePath,
      stdoutPath,
      stderrPath,
    },
    job,
    lastMessage,
    stdout,
    stderr,
    lastMessagePreview: truncateText(lastMessage, 1600),
    stdoutPreview: truncateText(stdout, 800),
    stderrPreview: truncateText(stderr, 800),
  };
}

export function pickDefined(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && `${value}`.trim() !== "") {
      return value;
    }
  }
  return undefined;
}

export function deriveOutcome(status, exitCode) {
  const normalizedStatus = `${status ?? ""}`.trim().toLowerCase();
  if (normalizedStatus === "completed" && Number(exitCode) === 0) {
    return "success";
  }
  if (normalizedStatus === "running" || normalizedStatus === "queued") {
    return normalizedStatus;
  }
  if (normalizedStatus === "timed_out") {
    return "timed_out";
  }
  if (normalizedStatus) {
    return "failed";
  }
  if (exitCode === 0) {
    return "success";
  }
  if (exitCode === undefined || exitCode === null || exitCode === "") {
    return "unknown";
  }
  return Number(exitCode) === 0 ? "success" : "failed";
}

export function toIsoTime(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      return new Date(Number(trimmed)).toISOString();
    }
    const time = Date.parse(trimmed);
    if (Number.isFinite(time)) {
      return new Date(time).toISOString();
    }
  }
  return null;
}

export function isTerminalStatus(status) {
  return new Set(["completed", "failed", "timed_out", "canceled", "cancelled", "error"]).has(
    `${status ?? ""}`.trim().toLowerCase(),
  );
}

export function mergeJobSnapshot({ jobId, indexEntry = null, remoteJob = null, artifactState = null, statusUrl = null }) {
  const artifact = artifactState ?? readArtifactState(jobId);
  const artifactJob = artifact?.job && typeof artifact.job === "object" ? artifact.job : null;

  const status = pickDefined(remoteJob?.status, artifactJob?.status, indexEntry?.status, "unknown");
  const exitCode = pickDefined(remoteJob?.exitCode, artifactJob?.exitCode, indexEntry?.exitCode, null);
  const promptText = pickDefined(remoteJob?.prompt, artifactJob?.prompt, indexEntry?.promptPreview, "");
  const lastMessagePreview = truncateText(
    pickDefined(artifact.lastMessage, remoteJob?.lastMessage, artifactJob?.lastMessage, indexEntry?.lastMessagePreview, ""),
    1600,
  );
  const stdoutPreview = truncateText(
    pickDefined(artifact.stdout, remoteJob?.stdout, artifactJob?.stdout, indexEntry?.stdoutPreview, ""),
    800,
  );
  const stderrPreview = truncateText(
    pickDefined(artifact.stderr, remoteJob?.stderr, artifactJob?.stderr, indexEntry?.stderrPreview, ""),
    800,
  );

  return {
    jobId,
    sessionKey: pickDefined(remoteJob?.sessionKey, artifactJob?.sessionKey, indexEntry?.sessionKey, null),
    status,
    exitCode,
    outcome: deriveOutcome(status, exitCode),
    createdAt: pickDefined(
      toIsoTime(remoteJob?.createdAtMs),
      toIsoTime(artifactJob?.createdAtMs),
      toIsoTime(indexEntry?.createdAt),
      indexEntry?.createdAt,
      null,
    ),
    startedAt: pickDefined(toIsoTime(remoteJob?.startedAtMs), toIsoTime(artifactJob?.startedAtMs), indexEntry?.startedAt, null),
    finishedAt: pickDefined(
      toIsoTime(remoteJob?.finishedAtMs),
      toIsoTime(artifactJob?.finishedAtMs),
      indexEntry?.finishedAt,
      null,
    ),
    cwd: pickDefined(remoteJob?.cwd, artifactJob?.cwd, indexEntry?.cwd, null),
    model: pickDefined(remoteJob?.model, artifactJob?.model, indexEntry?.model, null),
    promptPreview: promptPreview(promptText, 260),
    promptLength: pickDefined(remoteJob?.prompt?.length, artifactJob?.prompt?.length, indexEntry?.promptLength, null),
    lastMessagePreview,
    stdoutPreview,
    stderrPreview,
    artifactPath: pickDefined(artifact?.artifactPath, remoteJob?.artifactPath, artifactJob?.artifactPath, indexEntry?.artifactPath, null),
    statusUrl: pickDefined(statusUrl, indexEntry?.statusUrl, null),
    logPath: pickDefined(indexEntry?.logPath, null),
    notifyStatus: pickDefined(remoteJob?.notifyStatus, artifactJob?.notifyStatus, indexEntry?.notifyStatus, null),
    notifyError: pickDefined(remoteJob?.notifyError, artifactJob?.notifyError, indexEntry?.notifyError, null),
    files: artifact?.files ?? null,
    source: remoteJob ? "bridge+artifact" : artifactJob ? "artifact" : "index",
  };
}

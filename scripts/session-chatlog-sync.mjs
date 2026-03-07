#!/usr/bin/env node
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const CURRENT_MESSAGE_MARKER = "[Current message - respond to this]";
const HISTORY_CONTEXT_RE = /^Recent group context \(last \d+ msgs\):\s*/i;
const ONEBOT_HEADER_RE = /^\[OneBot\s+(.+?)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+UTC\]\s*/;
const REPLY_TAG_RE = /\[\[\s*(?:reply_to_current|reply_to\s*:\s*[^\]\n]+)\s*\]\]/gi;
const MESSAGE_ID_RE = /\[message_id:\s*([^\]\n]+)\]\s*$/i;
const FROM_RE = /\[from:\s*([^\]\n]+)\]\s*$/i;
const NON_RENDERABLE_ASSISTANT = new Set(["NO_REPLY"]);

function parseArgs(argv) {
  const opts = {
    agentId: "main",
    sessionKey: "",
    channel: "",
    dryRun: false,
    prune: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i] ?? "";
    if (arg === "--agent") {
      opts.agentId = (argv[i + 1] ?? "").trim() || "main";
      i += 1;
      continue;
    }
    if (arg === "--session") {
      opts.sessionKey = (argv[i + 1] ?? "").trim();
      i += 1;
      continue;
    }
    if (arg === "--channel") {
      opts.channel = (argv[i + 1] ?? "").trim().toLowerCase();
      i += 1;
      continue;
    }
    if (arg === "--dry-run") {
      opts.dryRun = true;
      continue;
    }
    if (arg === "--prune") {
      opts.prune = true;
    }
  }
  return opts;
}

function trimString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function sanitizeFilePart(value, fallback = "unknown") {
  const cleaned = (value || fallback).replace(/[\\/:*?"<>|]+/g, "_").trim();
  return cleaned || fallback;
}

function normalizeText(value) {
  return value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function compactWhitespace(value) {
  return value.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function parseSenderLabel(label) {
  const cleaned = trimString(label);
  if (!cleaned) return { userName: "", userId: "" };
  const match = cleaned.match(/^(.*)\(([^()]+)\)\s*$/);
  if (!match) return { userName: cleaned, userId: "" };
  return {
    userName: trimString(match[1]),
    userId: trimString(match[2]),
  };
}

function looksLikeMachineGroupName(value, groupId) {
  if (!value) return true;
  const lower = value.toLowerCase();
  return (
    lower === "unknown" ||
    lower === `group:${groupId}` ||
    lower === `onebot:g-group-${groupId}` ||
    lower === `g-group-${groupId}`
  );
}

function inferGroupId(sessionKey, entry) {
  const keyMatch = sessionKey.match(/:group:([^:]+)$/);
  if (keyMatch?.[1]) return keyMatch[1];
  const subject = trimString(entry?.subject);
  if (subject.startsWith("group:")) return subject.slice("group:".length);
  const lastTo = trimString(entry?.lastTo);
  if (lastTo.startsWith("group:")) return lastTo.slice("group:".length);
  const deliveryTo = trimString(entry?.deliveryContext?.to);
  if (deliveryTo.startsWith("group:")) return deliveryTo.slice("group:".length);
  return "";
}

function inferDmUserId(sessionKey, entry) {
  const originFrom = trimString(entry?.origin?.from);
  const fromMatch = originFrom.match(/(?:^|:)user:([^:]+)$/);
  if (fromMatch?.[1]) return fromMatch[1];
  const subject = trimString(entry?.subject);
  if (subject.startsWith("user:")) return subject.slice("user:".length);
  const lastTo = trimString(entry?.lastTo);
  if (lastTo.startsWith("user:")) return lastTo.slice("user:".length);
  if (sessionKey === "agent:main:main") return "281894872";
  return "";
}

function inferDmUserName(entry, dmUserId) {
  const label = trimString(entry?.label);
  const displayName = trimString(entry?.displayName);
  if (label && label !== `user:${dmUserId}` && label !== "main") return label;
  if (displayName && displayName !== "main") return displayName;
  if (dmUserId === "281894872") return "dogami";
  return "unknown";
}

function buildConversationMeta(sessionKey, entry, transcriptPath) {
  const channel =
    trimString(entry?.deliveryContext?.channel).toLowerCase() ||
    trimString(entry?.lastChannel).toLowerCase() ||
    trimString(entry?.channel).toLowerCase() ||
    "unknown";
  const rawChatType = trimString(entry?.chatType).toLowerCase();
  const chatType =
    rawChatType === "direct" || rawChatType === "private" ? "dm" : rawChatType || "other";
  const groupId = chatType === "group" ? inferGroupId(sessionKey, entry) : "";
  const rawGroupName =
    trimString(entry?.groupName) ||
    trimString(entry?.groupChannel) ||
    trimString(entry?.label) ||
    trimString(entry?.displayName);
  const groupName =
    chatType === "group" && !looksLikeMachineGroupName(rawGroupName, groupId)
      ? rawGroupName
      : "unknown";
  const dmUserId = chatType === "group" ? "" : inferDmUserId(sessionKey, entry);
  const dmUserName = chatType === "group" ? "" : inferDmUserName(entry, dmUserId);
  return {
    sessionKey,
    sessionId: trimString(entry?.sessionId),
    transcriptPath,
    channel,
    chatType,
    groupId,
    groupName,
    dmUserId,
    dmUserName,
  };
}

function shouldIncludeConversation(meta) {
  if (!meta.sessionKey || !meta.sessionId || !meta.transcriptPath) return false;
  if (meta.sessionKey.startsWith("cron:")) return false;
  if (meta.sessionKey.startsWith("hook:")) return false;
  if (meta.sessionKey.startsWith("probe-")) return false;
  if (!meta.channel || meta.channel === "internal") return false;
  return meta.chatType === "group" || meta.chatType === "dm" || meta.sessionKey === "agent:main:main";
}

function parseJsonLine(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function extractTextBlocks(content) {
  if (typeof content === "string") return [content];
  if (!Array.isArray(content)) return [];
  const blocks = [];
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    if (block.type === "text" && typeof block.text === "string") {
      blocks.push(block.text);
    }
  }
  return blocks;
}

function stripTrailingMeta(text) {
  let cleaned = normalizeText(text).trim();
  let sourceMessageId = "";
  let senderMeta = { userName: "", userId: "" };

  let changed = true;
  while (changed) {
    changed = false;
    const messageIdMatch = cleaned.match(MESSAGE_ID_RE);
    if (messageIdMatch) {
      sourceMessageId = trimString(messageIdMatch[1]) || sourceMessageId;
      cleaned = cleaned.slice(0, messageIdMatch.index).trimEnd();
      changed = true;
    }
    const fromMatch = cleaned.match(FROM_RE);
    if (fromMatch) {
      senderMeta = parseSenderLabel(fromMatch[1]);
      cleaned = cleaned.slice(0, fromMatch.index).trimEnd();
      changed = true;
    }
  }

  return { cleaned, sourceMessageId, senderMeta };
}

function stripSystemPreamble(text) {
  const cleaned = normalizeText(text).trim();
  const marker = "\n[OneBot ";
  const idx = cleaned.lastIndexOf(marker);
  if (idx > 0 && /^System:/i.test(cleaned)) {
    return cleaned.slice(idx + 1).trim();
  }
  return cleaned;
}

function looksLikeSyntheticUserText(text) {
  const compact = compactWhitespace(text);
  if (!compact) return true;
  if (/^System:\s*\[[^\]]+\]\s*(Exec (?:completed|running|denied)|Cron:|Hook )/i.test(compact)) {
    return true;
  }
  if (/^GatewayRestart:/i.test(compact)) return true;
  if (/^\[cron:[^\]]+\]/i.test(compact)) return true;
  return false;
}

function parseUserText(raw, meta) {
  let text = stripSystemPreamble(raw);
  let senderMeta = { userName: "", userId: "" };
  let sourceMessageId = "";

  if (text.includes(CURRENT_MESSAGE_MARKER)) {
    text = text.slice(text.lastIndexOf(CURRENT_MESSAGE_MARKER) + CURRENT_MESSAGE_MARKER.length).trim();
  }

  const recentMatch = text.match(
    /^\[OneBot\s+(.+?)\s+\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+UTC\]\s+Recent group context \(last \d+ msgs\):\n[\s\S]*?\n\n([\s\S]+)$/i,
  );
  if (recentMatch) {
    senderMeta.userName = trimString(recentMatch[1]);
    text = trimString(recentMatch[2]);
  }

  const headerMatch = text.match(ONEBOT_HEADER_RE);
  if (headerMatch) {
    senderMeta.userName = senderMeta.userName || trimString(headerMatch[1]);
    text = text.slice(headerMatch[0].length).trim();
  }

  if (HISTORY_CONTEXT_RE.test(text)) {
    const splitIndex = text.indexOf("\n\n");
    if (splitIndex >= 0) {
      text = text.slice(splitIndex + 2).trim();
    }
    text = text.replace(HISTORY_CONTEXT_RE, "").trim();
  }

  const stripped = stripTrailingMeta(text);
  text = stripped.cleaned;
  sourceMessageId = stripped.sourceMessageId;
  senderMeta = {
    userName: stripped.senderMeta.userName || senderMeta.userName,
    userId: stripped.senderMeta.userId || senderMeta.userId,
  };

  if (!text) return null;
  if (looksLikeSyntheticUserText(text)) return null;

  return {
    text,
    userName: senderMeta.userName || meta.dmUserName || "unknown",
    userId: senderMeta.userId || meta.dmUserId || "unknown",
    sourceMessageId,
  };
}

function cleanAssistantText(raw) {
  const cleaned = compactWhitespace(normalizeText(raw).replace(REPLY_TAG_RE, "").trim());
  if (!cleaned) return "";
  if (NON_RENDERABLE_ASSISTANT.has(cleaned)) return "";
  return cleaned;
}

function normalizeComparableText(value) {
  return compactWhitespace(value).replace(/\s+/g, " ").trim();
}

function dedupeEntries(entries) {
  const deduped = [];
  for (const entry of entries) {
    const previous = deduped[deduped.length - 1];
    if (!previous) {
      deduped.push(entry);
      continue;
    }
    const sameRole = previous.role === entry.role;
    const sameSourceMessageId =
      previous.sourceMessageId &&
      entry.sourceMessageId &&
      previous.sourceMessageId === entry.sourceMessageId;
    const sameText = normalizeComparableText(previous.text) === normalizeComparableText(entry.text);
    const previousTime = Date.parse(previous.time);
    const nextTime = Date.parse(entry.time);
    const withinMirrorWindow =
      Number.isFinite(previousTime) &&
      Number.isFinite(nextTime) &&
      Math.abs(nextTime - previousTime) <= 15_000;
    if (sameRole && sameText && (sameSourceMessageId || withinMirrorWindow)) {
      continue;
    }
    deduped.push(entry);
  }
  return deduped;
}

function buildLogFileRelPath(meta, date) {
  const baseDir = path.posix.join("memory", "chatlog", date, meta.channel || "unknown");
  if (meta.chatType === "group") {
    return path.posix.join(
      baseDir,
      `group-${sanitizeFilePart(meta.groupId)}-${sanitizeFilePart(meta.groupName)}.md`,
    );
  }
  if (meta.chatType === "dm") {
    return path.posix.join(
      baseDir,
      `dm-${sanitizeFilePart(meta.dmUserId)}-${sanitizeFilePart(meta.dmUserName)}.md`,
    );
  }
  return path.posix.join(baseDir, `other-${sanitizeFilePart(meta.sessionKey)}.md`);
}

function renderMarkdownFile(meta, date, relPath, entries) {
  const header = [
    "---",
    `date: ${date}`,
    `channel: ${meta.channel}`,
    `chatType: ${meta.chatType}`,
    meta.groupId ? `groupId: ${meta.groupId}` : null,
    meta.groupName && meta.chatType === "group" ? `groupName: ${meta.groupName}` : null,
    meta.dmUserId && meta.chatType === "dm" ? `userId: ${meta.dmUserId}` : null,
    meta.dmUserName && meta.chatType === "dm" ? `userName: ${meta.dmUserName}` : null,
    `sessionKey: ${meta.sessionKey}`,
    `sessionId: ${meta.sessionId}`,
    `sessionFile: ${meta.transcriptPath}`,
    `file: ${relPath}`,
    "---",
    "",
  ].filter(Boolean);

  const body = [];
  for (const entry of entries) {
    const parts = [`### ${entry.time}`, `role=${entry.role}`, `eventId=${entry.eventId}`];
    if (entry.role === "user") {
      parts.push(`userId=${entry.userId || "unknown"}`);
      parts.push(`userName=${entry.userName || "unknown"}`);
    }
    if (entry.sourceMessageId) {
      parts.push(`messageId=${entry.sourceMessageId}`);
    }
    body.push(parts.join(" | "));
    body.push(entry.text);
    body.push("");
  }

  return `${header.join("\n")}\n${body.join("\n").trimEnd()}\n`;
}

function renderIndexRow(meta, date, relPath, entry) {
  return JSON.stringify({
    date,
    channel: meta.channel,
    chatType: meta.chatType,
    groupId: meta.groupId || undefined,
    groupName: meta.chatType === "group" ? meta.groupName : undefined,
    userId: entry.role === "user" ? entry.userId || undefined : undefined,
    userName: entry.role === "user" ? entry.userName || undefined : undefined,
    sessionKey: meta.sessionKey,
    sessionId: meta.sessionId,
    sessionFile: meta.transcriptPath,
    role: entry.role,
    eventId: entry.eventId,
    messageId: entry.sourceMessageId || undefined,
    time: entry.time,
    file: relPath,
    text: entry.text.slice(0, 240),
  });
}

async function readSessionStore(storePath) {
  const raw = await fs.readFile(storePath, "utf8");
  return JSON.parse(raw);
}

async function resolveTranscriptPath(entry, sessionId, sessionsDir) {
  const configured = trimString(entry?.sessionFile);
  const fallbacks = [
    configured,
    configured ? path.join(sessionsDir, path.basename(configured)) : "",
    path.join(sessionsDir, `${sessionId}.jsonl`),
  ].filter(Boolean);

  for (const candidate of fallbacks) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return configured || path.join(sessionsDir, `${sessionId}.jsonl`);
}

async function readTranscriptEntries(meta) {
  const raw = await fs.readFile(meta.transcriptPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const record = parseJsonLine(lines[index]);
    if (!record || record.type !== "message" || !record.message) continue;
    const role = trimString(record.message.role).toLowerCase();
    if (role !== "user" && role !== "assistant") continue;
    const time =
      trimString(record.timestamp) ||
      trimString(record.message.timestamp) ||
      new Date().toISOString();
    if (role === "user") {
      const rawText = extractTextBlocks(record.message.content).join("\n\n");
      const parsed = parseUserText(rawText, meta);
      if (!parsed?.text) continue;
      entries.push({
        eventId: trimString(record.id) || `${meta.sessionId}-${index}`,
        role: "user",
        time,
        text: parsed.text,
        userName: parsed.userName,
        userId: parsed.userId,
        sourceMessageId: parsed.sourceMessageId,
        sortIndex: index,
      });
      continue;
    }
    const assistantText = cleanAssistantText(extractTextBlocks(record.message.content).join("\n\n"));
    if (!assistantText) continue;
    entries.push({
      eventId: trimString(record.id) || `${meta.sessionId}-${index}`,
      role: "assistant",
      time,
      text: assistantText,
      userName: "",
      userId: "",
      sourceMessageId: "",
      sortIndex: index,
    });
  }
  entries.sort((a, b) => {
    const timeDiff = Date.parse(a.time) - Date.parse(b.time);
    if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff;
    return a.sortIndex - b.sortIndex;
  });
  return dedupeEntries(entries);
}

async function buildOutputs(params) {
  const outputs = new Map();
  const indexRowsByFile = new Map();
  const store = await readSessionStore(params.storePath);
  for (const [sessionKey, entry] of Object.entries(store)) {
    if (params.sessionKey && sessionKey !== params.sessionKey) continue;
    const sessionId = trimString(entry?.sessionId);
    if (!sessionId) continue;
    const transcriptPath = await resolveTranscriptPath(entry, sessionId, params.sessionsDir);
    const meta = buildConversationMeta(sessionKey, entry, transcriptPath);
    if (!shouldIncludeConversation(meta)) continue;
    if (params.channel && meta.channel !== params.channel) continue;
    try {
      await fs.access(transcriptPath);
    } catch {
      continue;
    }
    const transcriptEntries = await readTranscriptEntries(meta);
    if (transcriptEntries.length === 0) continue;

    const byFile = new Map();
    for (const item of transcriptEntries) {
      const date = trimString(item.time).slice(0, 10);
      if (!date) continue;
      const relPath = buildLogFileRelPath(meta, date);
      if (!byFile.has(relPath)) {
        byFile.set(relPath, { date, meta, entries: [] });
      }
      byFile.get(relPath).entries.push(item);
    }

    for (const [relPath, group] of byFile.entries()) {
      const content = renderMarkdownFile(group.meta, group.date, relPath, group.entries);
      outputs.set(relPath, content);
      indexRowsByFile.set(
        relPath,
        group.entries.map((item) => renderIndexRow(group.meta, group.date, relPath, item)),
      );
    }
  }

  return { outputs, indexRowsByFile };
}

async function collectExistingManagedFiles(rootDir) {
  const found = new Set();
  async function walk(dir) {
    let entries = [];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!entry.name.endsWith(".md") && entry.name !== "index.jsonl") continue;
      found.add(full);
    }
  }
  await walk(rootDir);
  return found;
}

async function readExistingIndexRows(workspaceRoot, desiredRelPaths) {
  const rowsByFile = new Map();
  const indexPath = path.join(workspaceRoot, "memory", "chatlog", "index.jsonl");
  let raw = "";
  try {
    raw = await fs.readFile(indexPath, "utf8");
  } catch {
    return rowsByFile;
  }

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const record = parseJsonLine(trimmed);
    const relPath = trimString(record?.file);
    if (!relPath) continue;
    const absPath = path.join(workspaceRoot, relPath);
    if (!desiredRelPaths.has(relPath) && !(await pathExists(absPath))) {
      continue;
    }
    const bucket = rowsByFile.get(relPath) || [];
    bucket.push(trimmed);
    rowsByFile.set(relPath, bucket);
  }

  return rowsByFile;
}

function compareIndexRows(a, b) {
  const left = parseJsonLine(a) || {};
  const right = parseJsonLine(b) || {};
  const leftTime = trimString(left.time);
  const rightTime = trimString(right.time);
  if (leftTime !== rightTime) return leftTime.localeCompare(rightTime);
  const leftFile = trimString(left.file);
  const rightFile = trimString(right.file);
  if (leftFile !== rightFile) return leftFile.localeCompare(rightFile);
  const leftEventId = trimString(left.eventId);
  const rightEventId = trimString(right.eventId);
  return leftEventId.localeCompare(rightEventId);
}

async function writeOutputs(workspaceRoot, buildResult, dryRun, prune) {
  const managedRoot = path.join(workspaceRoot, "memory", "chatlog");
  const indexRelPath = path.posix.join("memory", "chatlog", "index.jsonl");
  const desiredRelPaths = new Set(buildResult.outputs.keys());
  const desired = new Set();
  let written = 0;
  let removed = 0;

  const mergedIndexRows = await readExistingIndexRows(workspaceRoot, desiredRelPaths);
  for (const [relPath, rows] of buildResult.indexRowsByFile.entries()) {
    mergedIndexRows.set(relPath, rows);
  }
  if (prune) {
    for (const relPath of [...mergedIndexRows.keys()]) {
      if (!desiredRelPaths.has(relPath)) {
        mergedIndexRows.delete(relPath);
      }
    }
  }

  for (const [relPath, content] of buildResult.outputs.entries()) {
    const absPath = path.join(workspaceRoot, relPath);
    desired.add(absPath);
    if (dryRun) continue;
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    let current = "";
    try {
      current = await fs.readFile(absPath, "utf8");
    } catch {}
    if (current === content) continue;
    await fs.writeFile(absPath, content, "utf8");
    written += 1;
  }

  const indexContent =
    [...mergedIndexRows.values()].flat().sort(compareIndexRows).join("\n").trimEnd() + "\n";
  const indexAbsPath = path.join(workspaceRoot, indexRelPath);
  desired.add(indexAbsPath);
  if (!dryRun) {
    await fs.mkdir(path.dirname(indexAbsPath), { recursive: true });
    let currentIndex = "";
    try {
      currentIndex = await fs.readFile(indexAbsPath, "utf8");
    } catch {}
    if (currentIndex !== indexContent) {
      await fs.writeFile(indexAbsPath, indexContent, "utf8");
      written += 1;
    }
  }

  if (!dryRun && prune) {
    const existing = await collectExistingManagedFiles(managedRoot);
    for (const filePath of existing) {
      if (desired.has(filePath)) continue;
      await fs.rm(filePath, { force: true });
      removed += 1;
    }
  }

  return { written, removed };
}

async function resolveConfigRoot(workspaceRoot, agentId) {
  const envConfigRoot = trimString(process.env.CLAWDBOT_CONFIG_DIR);
  const localRuntimeConfigRoot = path.resolve(workspaceRoot, "..", "config");
  const defaultConfigRoot = path.join(os.homedir(), ".clawdbot");
  const candidates = [
    envConfigRoot,
    localRuntimeConfigRoot,
    defaultConfigRoot,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const storePath = path.join(candidate, "agents", agentId, "sessions", "sessions.json");
    if (await pathExists(storePath)) {
      return candidate;
    }
  }

  return envConfigRoot || localRuntimeConfigRoot || defaultConfigRoot;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const workspaceRoot = process.cwd();
  const configRoot = await resolveConfigRoot(workspaceRoot, options.agentId);
  const sessionsDir = path.join(configRoot, "agents", options.agentId, "sessions");
  const storePath = path.join(sessionsDir, "sessions.json");

  try {
    const buildResult = await buildOutputs({
      storePath,
      sessionsDir,
      sessionKey: options.sessionKey,
      channel: options.channel,
    });
    const summary = await writeOutputs(workspaceRoot, buildResult, options.dryRun, options.prune);
    process.stdout.write(
      `${JSON.stringify({
        ok: true,
        agentId: options.agentId,
        sessionKey: options.sessionKey || null,
        channel: options.channel || null,
        dryRun: options.dryRun,
        prune: options.prune,
        files: buildResult.outputs.size + 1,
        written: summary.written,
        removed: summary.removed,
        outputRoot: "memory/chatlog",
        rawSessionsRoot: path.relative(workspaceRoot, sessionsDir).replace(/\\/g, "/"),
        rawStorePath: path.relative(workspaceRoot, storePath).replace(/\\/g, "/"),
      })}\n`,
    );
  } catch (err) {
    process.stderr.write(
      `${JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      })}\n`,
    );
    process.exit(1);
  }
}

await main();

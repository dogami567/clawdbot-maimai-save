import type {
  ClawdbotConfig,
  GroupToolPolicyConfig,
  ReplyPayload,
  RuntimeEnv,
} from "clawdbot/plugin-sdk";
import type { PluginRuntime } from "clawdbot/plugin-sdk";
import WebSocket from "ws";

import type { ResolvedOneBotAccount } from "./accounts.js";
import { resolveOneBotInboundImage } from "./media-cache.js";

type ChannelLog = {
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
  debug?: (message: string) => void;
};

type OneBotMessageEvent = {
  post_type?: string;
  message_type?: string;
  self_id?: string | number;
  user_id?: string | number;
  group_id?: string | number;
  message_id?: string | number;
  time?: number;
  message?: unknown;
  raw_message?: string;
  sender?: {
    nickname?: string;
    card?: string;
  };
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveOneBotWsUrl(account: ResolvedOneBotAccount): string {
  if (account.wsUrl?.trim()) return account.wsUrl.trim();
  if (account.httpUrl?.trim()) {
    const http = account.httpUrl.trim();
    if (http.startsWith("http://")) return `ws://${http.slice("http://".length)}`;
    if (http.startsWith("https://")) return `wss://${http.slice("https://".length)}`;
  }
  throw new Error("OneBot requires channels.onebot.wsUrl (or httpUrl that can derive wsUrl)");
}

function buildPairingIdLine(senderId: string) {
  return `Your QQ id: ${senderId}`;
}

type RecentMediaEntry = {
  mediaTokens: string;
  seenAt: number;
};

const recentMediaByPeer = new Map<string, RecentMediaEntry>();
const RECENT_MEDIA_WINDOW_MS = 10_000;

type RecentImageHashEntry = {
  seenAt: number;
  count: number;
};

const recentImageHashesByPeer = new Map<string, Map<string, RecentImageHashEntry>>();
const RECENT_IMAGE_DEDUPE_WINDOW_MS = 5 * 60_000;

type RecentGroupEntry = {
  at: number;
  senderId: string;
  senderName: string;
  body: string;
  fullBody: string;
};

const recentGroupContext = new Map<string, RecentGroupEntry[]>();
const RECENT_GROUP_CONTEXT_MAX = 50;
const RECENT_GROUP_CONTEXT_WINDOW_MS = 5 * 60_000;
const RECENT_GROUP_CONTEXT_ATTACH_LIMIT = 10;

function extractImageTokens(text: string): string {
  const matches = text.match(/\[image:[^\]]+\]/g);
  return matches ? matches.join("") : "";
}

function maybeAttachRecentMedia(params: {
  peerKey: string;
  body: string;
}): string {
  const body = params.body;
  const imageTokens = extractImageTokens(body);

  if (imageTokens) {
    recentMediaByPeer.set(params.peerKey, { mediaTokens: imageTokens, seenAt: Date.now() });
    return body;
  }

  const recent = recentMediaByPeer.get(params.peerKey);
  if (!recent) return body;
  if (Date.now() - recent.seenAt > RECENT_MEDIA_WINDOW_MS) return body;

  const trimmed = body.trim();
  if (!trimmed) return body;

  // Common QQ habit: send image, then immediately send a short "this" text.
  if (trimmed.length > 30) return body;

  return `${recent.mediaTokens}\n${body}`;
}

async function rewriteInboundImageRefs(text: string): Promise<string> {
  if (!text.includes("[image:")) return text;

  const matches = [...text.matchAll(/\[image:([^\]]+)\]/g)];
  if (matches.length === 0) return text;

  const uniqueRefs = Array.from(
    new Set(matches.map((m) => String(m[1] ?? "")).map((ref) => ref.trim()).filter(Boolean))
  );

  const resolvedPairs = await Promise.all(
    uniqueRefs.map(async (ref) => {
      const resolved = await resolveOneBotInboundImage(ref);
      return [ref, resolved] as const;
    })
  );

  const resolvedByRef = new Map<string, string>(resolvedPairs);

  return text.replace(/\[image:([^\]]+)\]/g, (full, rawRef) => {
    const key = String(rawRef ?? "").trim();
    const resolved = resolvedByRef.get(key);
    return resolved ? `[image:${resolved}]` : full;
  });
}

function recordRecentGroupMessage(params: {
  groupId: string;
  senderId: string;
  senderName: string;
  body: string;
  fullBody: string;
}): void {
  const now = Date.now();
  const list = recentGroupContext.get(params.groupId) ?? [];

  // Drop stale entries
  const fresh = list.filter((entry) => now - entry.at <= RECENT_GROUP_CONTEXT_WINDOW_MS);

  fresh.push({
    at: now,
    senderId: params.senderId,
    senderName: params.senderName,
    body: params.body,
    fullBody: params.fullBody,
  });

  while (fresh.length > RECENT_GROUP_CONTEXT_MAX) fresh.shift();
  recentGroupContext.set(params.groupId, fresh);
}

function buildRecentGroupContextPrefix(params: {
  groupId: string;
  excludeSenderId?: string;
  limit?: number;
}): string {
  const list = recentGroupContext.get(params.groupId) ?? [];
  if (list.length === 0) return "";

  const limit = Math.max(0, Math.min(params.limit ?? RECENT_GROUP_CONTEXT_ATTACH_LIMIT, 50));
  if (limit === 0) return "";

  const now = Date.now();
  const filtered = list
    .filter((entry) => now - entry.at <= RECENT_GROUP_CONTEXT_WINDOW_MS)
    .filter((entry) => (params.excludeSenderId ? entry.senderId !== params.excludeSenderId : true));

  const slice = filtered.slice(-limit);
  if (slice.length === 0) return "";

  const lines = slice.map((entry) => `${entry.senderName}: ${entry.body}`.trim()).filter(Boolean);
  if (lines.length === 0) return "";

  return `Recent group context (last ${lines.length} msgs):\n${lines.join("\n")}\n\n`;
}

function maybeDedupeRecentImages(params: { peerKey: string; body: string }): string {
  const body = params.body;
  if (!body.includes("[image:")) return body;

  const matches = [...body.matchAll(/\[image:([^\]]+)\]/g)];
  if (matches.length === 0) return body;

  const now = Date.now();
  const map = recentImageHashesByPeer.get(params.peerKey) ?? new Map();

  // Cleanup old entries
  for (const [hash, entry] of map.entries()) {
    if (now - entry.seenAt > RECENT_IMAGE_DEDUPE_WINDOW_MS) {
      map.delete(hash);
    }
  }

  const isSha256Hex = (value: string) => /^[a-f0-9]{64}$/i.test(value);

  let changed = false;
  let out = body;

  for (const m of matches) {
    const ref = String(m[1] ?? "").trim();
    if (!ref) continue;

    // After rewriteInboundImageRefs, inbound images are usually local paths in
    // `.clawdbot/data/onebot-media/<sha256>.<ext>`.
    const base = ref.split(/[\\/]/).pop() ?? "";
    const dot = base.lastIndexOf(".");
    const stem = dot > 0 ? base.slice(0, dot) : base;
    if (!isSha256Hex(stem)) continue;

    const existing = map.get(stem);
    if (!existing) {
      map.set(stem, { seenAt: now, count: 1 });
      continue;
    }

    existing.seenAt = now;
    existing.count += 1;

    const short = stem.slice(0, 8);
    const placeholder = `[image:repeat:${short} x${existing.count}]`;
    const token = `[image:${ref}]`;
    if (out.includes(token)) {
      out = out.replaceAll(token, placeholder);
      changed = true;
    }
  }

  if (map.size > 0) recentImageHashesByPeer.set(params.peerKey, map);
  return changed ? out : body;
}

export async function monitorOneBotProvider(params: {
  account: ResolvedOneBotAccount;
  cfg: ClawdbotConfig;
  core: PluginRuntime;
  runtime: RuntimeEnv;
  abortSignal: AbortSignal;
  log?: ChannelLog;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  resolveGroupConfig: (groupId: string) => { requireMention: boolean; tools?: GroupToolPolicyConfig };
  isAllowedSender: (senderId: string, allowFrom: Array<string | number> | undefined) => boolean;
  normalizeAllowFrom: (values: Array<string | number> | undefined) => string[];
  resolveMentionGatingWithBypass: typeof import("clawdbot/plugin-sdk").resolveMentionGatingWithBypass;
  extractTextAndMentions: (params: {
    message: unknown;
    selfId?: string | null;
  }) => { text: string; wasMentioned: boolean; hasAnyMention: boolean };
  sendText: (params: { target: string; text: string }) => Promise<{ messageId?: string }>;
}): Promise<void> {
  const { account, cfg, core, runtime, abortSignal, statusSink } = params;

  const logger = core.logging.getChildLogger({ module: "onebot" });
  const logVerbose = (message: string) => {
    if (!core.logging.shouldLogVerbose()) return;
    logger.debug?.(message);
  };

  const wsUrl = resolveOneBotWsUrl(account);
  let backoffMs = 1_000;

  const connectOnce = async (): Promise<void> => {
    const headers: Record<string, string> = {};
    if (account.accessToken) {
      headers.authorization = `Bearer ${account.accessToken}`;
    }

    const ws = new WebSocket(wsUrl, {
      headers,
    });

    const closeWs = () => {
      try {
        ws.close();
      } catch {
        // ignore
      }
    };

    const stop = () => closeWs();
    abortSignal.addEventListener("abort", stop, { once: true });

    const ready = new Promise<void>((resolve, reject) => {
      ws.once("open", () => resolve());
      ws.once("error", (err) => reject(err));
    });

    await ready;
    backoffMs = 1_000;
    params.log?.info?.(`[${account.accountId}] onebot ws connected`);

    const onMessage = (data: WebSocket.RawData) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        return;
      }
      const evt = parsed as OneBotMessageEvent;
      if (evt.post_type !== "message") return;

      statusSink?.({ lastInboundAt: Date.now() });

      void processInboundMessage({
        evt,
        account,
        cfg,
        core,
        runtime,
        logVerbose,
        statusSink,
        helpers: params,
      }).catch((err) => {
        runtime.error?.(`onebot: inbound processing failed: ${String(err)}`);
      });
    };

    ws.on("message", onMessage);

    await new Promise<void>((resolve) => {
      const onClose = () => resolve();
      ws.once("close", onClose);
      ws.once("error", onClose);
      if (abortSignal.aborted) {
        closeWs();
        resolve();
      }
    });

    ws.off("message", onMessage);
    abortSignal.removeEventListener("abort", stop);
  };

  while (!abortSignal.aborted) {
    try {
      await connectOnce();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      params.log?.error?.(`[${account.accountId}] onebot ws error: ${message}`);
      logVerbose(`onebot: reconnect in ${backoffMs}ms`);
      await sleep(backoffMs);
      backoffMs = Math.min(30_000, backoffMs * 2);
    }
  }
}

async function processInboundMessage(params: {
  evt: OneBotMessageEvent;
  account: ResolvedOneBotAccount;
  cfg: ClawdbotConfig;
  core: PluginRuntime;
  runtime: RuntimeEnv;
  logVerbose: (message: string) => void;
  statusSink?: (patch: { lastInboundAt?: number; lastOutboundAt?: number }) => void;
  helpers: {
    resolveGroupConfig: (groupId: string) => { requireMention: boolean; tools?: GroupToolPolicyConfig };
    isAllowedSender: (senderId: string, allowFrom: Array<string | number> | undefined) => boolean;
    normalizeAllowFrom: (values: Array<string | number> | undefined) => string[];
    resolveMentionGatingWithBypass: typeof import("clawdbot/plugin-sdk").resolveMentionGatingWithBypass;
    extractTextAndMentions: (params: {
      message: unknown;
      selfId?: string | null;
    }) => { text: string; wasMentioned: boolean; hasAnyMention: boolean };
    sendText: (params: { target: string; text: string }) => Promise<{ messageId?: string }>;
  };
}): Promise<void> {
  const { evt, account, cfg, core, runtime, logVerbose, statusSink, helpers } = params;
  const selfId = evt.self_id != null ? String(evt.self_id) : null;
  const senderId = evt.user_id != null ? String(evt.user_id) : "";
  if (!senderId) return;
  if (selfId && senderId === selfId) return;

  const isGroup = evt.message_type === "group" && evt.group_id != null;
  const groupId = isGroup ? String(evt.group_id) : null;

  const extracted = helpers.extractTextAndMentions({
    message: evt.message ?? evt.raw_message ?? "",
    selfId,
  });

  const peerKey = isGroup ? `group:${groupId}:user:${senderId}` : `user:${senderId}`;
  let rawBody = maybeAttachRecentMedia({ peerKey, body: extracted.text });
  if (!rawBody.trim()) return;

  try {
    rawBody = await rewriteInboundImageRefs(rawBody);
  } catch {
    // Non-fatal: keep original refs if caching fails.
  }

  const fullBody = rawBody;

  // Token saver: if the same image gets spammed repeatedly by the same peer,
  // keep the first occurrence as an image and turn subsequent repeats into a
  // lightweight text placeholder.
  rawBody = maybeDedupeRecentImages({ peerKey, body: rawBody });

  const onebotCfg = (cfg.channels as Record<string, unknown> | undefined)?.onebot as
    | {
        dmPolicy?: string;
        allowFrom?: Array<string | number>;
        groupPolicy?: string;
        groupAllowFrom?: Array<string | number>;
        groups?: Record<string, unknown>;
      }
    | undefined;

  const dmPolicy = (onebotCfg?.dmPolicy as string | undefined) ?? "pairing";
  const configAllowFrom = onebotCfg?.allowFrom ?? [];
  const shouldComputeAuth = core.channel.commands.shouldComputeCommandAuthorized(rawBody, cfg);
  const storeAllowFrom =
    !isGroup && (dmPolicy !== "open" || shouldComputeAuth)
      ? await core.channel.pairing.readAllowFromStore("onebot").catch(() => [])
      : [];
  const effectiveAllowFrom = [...configAllowFrom, ...storeAllowFrom];

  const groupAllowFromConfigured = onebotCfg?.groupAllowFrom ?? [];
  const groupAllowFrom =
    groupAllowFromConfigured.length > 0
      ? groupAllowFromConfigured
      : effectiveAllowFrom.length > 0
        ? effectiveAllowFrom
        : [];

  const useAccessGroups = cfg.commands?.useAccessGroups !== false;
  const commandAllowFrom = isGroup ? groupAllowFrom : effectiveAllowFrom;
  const senderAllowedForCommands = helpers.isAllowedSender(senderId, commandAllowFrom);
  const commandAuthorized = shouldComputeAuth
    ? core.channel.commands.resolveCommandAuthorizedFromAuthorizers({
        useAccessGroups,
        authorizers: [
          { configured: commandAllowFrom.length > 0, allowed: senderAllowedForCommands },
        ],
      })
    : undefined;

  const senderName = resolveSenderName(evt) || `user:${senderId}`;

  // Group context buffer: keep recent messages so a later @ mention can bring some
  // immediate prior context (and allow commands like "use the image above").
  const groupContextPrefix =
    isGroup && groupId
      ? buildRecentGroupContextPrefix({ groupId, limit: RECENT_GROUP_CONTEXT_ATTACH_LIMIT })
      : "";

  if (isGroup && groupId) {
    recordRecentGroupMessage({
      groupId,
      senderId,
      senderName,
      body: rawBody,
      fullBody,
    });
  }

  if (isGroup) {
    const defaultGroupPolicy = cfg.channels?.defaults?.groupPolicy;
    const groupPolicy =
      (onebotCfg?.groupPolicy as string | undefined) ?? defaultGroupPolicy ?? "allowlist";
    if (groupPolicy === "disabled") {
      logVerbose("onebot: drop group message (groupPolicy=disabled)");
      return;
    }
    if (groupPolicy === "allowlist") {
      if (groupAllowFrom.length === 0) {
        logVerbose("onebot: drop group message (groupPolicy=allowlist, no groupAllowFrom)");
        return;
      }
      if (!senderAllowedForCommands) {
        logVerbose(`onebot: drop group message (sender not allowed, user_id=${senderId})`);
        return;
      }
    }

    // Group allowlist by group id if groups config is present
    const groups = (onebotCfg?.groups ?? {}) as Record<string, unknown>;
    const groupAllowlistEnabled = Object.keys(groups).length > 0 && !Object.hasOwn(groups, "*");
    if (groupAllowlistEnabled && groupId && !Object.hasOwn(groups, groupId)) {
      logVerbose(`onebot: drop group message (group not allowlisted, group_id=${groupId})`);
      return;
    }

    const groupConfig = helpers.resolveGroupConfig(groupId ?? "");
    const allowTextCommands = core.channel.commands.shouldHandleTextCommands({
      cfg,
      surface: "onebot",
    });
    const mentionGate = helpers.resolveMentionGatingWithBypass({
      isGroup: true,
      requireMention: groupConfig.requireMention,
      canDetectMention: true,
      wasMentioned: extracted.wasMentioned,
      implicitMention: false,
      hasAnyMention: extracted.hasAnyMention,
      allowTextCommands,
      hasControlCommand: core.channel.text.hasControlCommand(rawBody, cfg),
      commandAuthorized: commandAuthorized === true,
    });
    if (mentionGate.shouldSkip) {
      logVerbose("onebot: drop group message (mention required)");
      return;
    }

    if (core.channel.commands.isControlCommandMessage(rawBody, cfg) && commandAuthorized !== true) {
      logVerbose(`onebot: drop control command from ${senderId}`);
      return;
    }
  } else {
    if (dmPolicy === "disabled") return;
    if (dmPolicy !== "open") {
      const allowed = senderAllowedForCommands;
      if (!allowed) {
        if (dmPolicy === "pairing") {
          const { code, created } = await core.channel.pairing.upsertPairingRequest({
            channel: "onebot",
            id: senderId,
            meta: { name: resolveSenderName(evt) || undefined },
          });
          if (created) {
            logVerbose(`onebot pairing request sender=${senderId}`);
            try {
              await helpers.sendText({
                target: `user:${senderId}`,
                text: core.channel.pairing.buildPairingReply({
                  channel: "onebot",
                  idLine: buildPairingIdLine(senderId),
                  code,
                }),
              });
              statusSink?.({ lastOutboundAt: Date.now() });
            } catch (err) {
              logVerbose(`onebot: pairing reply failed for ${senderId}: ${String(err)}`);
            }
          }
        }
        return;
      }
    }
  }

  const peer = {
    kind: isGroup ? ("group" as const) : ("dm" as const),
    id: isGroup ? (groupId ?? senderId) : senderId,
  };

  const route = core.channel.routing.resolveAgentRoute({
    cfg,
    channel: "onebot",
    accountId: account.accountId,
    peer,
  });

  const storePath = core.channel.session.resolveStorePath(cfg.session?.store, {
    agentId: route.agentId,
  });
  const envelopeOptions = core.channel.reply.resolveEnvelopeFormatOptions(cfg);
  const groupLabel = groupId ? `group:${groupId}` : undefined;
  const body = core.channel.reply.formatAgentEnvelope({
    channel: "OneBot",
    from: senderName,
    timestamp: evt.time ? evt.time * 1000 : Date.now(),
    envelope: envelopeOptions,
    body: groupContextPrefix ? `${groupContextPrefix}${rawBody}` : rawBody,
  });

  const ctxPayload = core.channel.reply.finalizeInboundContext({
    Body: body,
    RawBody: rawBody,
    CommandBody: rawBody,
    From: `onebot:user:${senderId}`,
    To: isGroup ? `onebot:group:${groupId}` : `onebot:user:${senderId}`,
    SessionKey: route.sessionKey,
    AccountId: route.accountId,
    ChatType: isGroup ? "group" : "direct",
    ConversationLabel: isGroup ? groupLabel : senderName,
    GroupSubject: isGroup ? groupLabel : undefined,
    SenderName: senderName,
    SenderId: senderId,
    Provider: "onebot",
    Surface: "onebot",
    MessageSid: evt.message_id != null ? String(evt.message_id) : undefined,
    Timestamp: evt.time ? evt.time * 1000 : Date.now(),
    WasMentioned: isGroup ? extracted.wasMentioned : true,
    CommandAuthorized: commandAuthorized,
    OriginatingChannel: "onebot" as const,
    OriginatingTo: isGroup ? `group:${groupId}` : `user:${senderId}`,
  });

  await core.channel.session.recordInboundSession({
    storePath,
    sessionKey: ctxPayload.SessionKey ?? route.sessionKey,
    ctx: ctxPayload,
    onRecordError: (err) => {
      runtime.error?.(`onebot: failed updating session meta: ${String(err)}`);
    },
  });

  await core.channel.reply.dispatchReplyWithBufferedBlockDispatcher({
    ctx: ctxPayload,
    cfg,
    dispatcherOptions: {
      deliver: async (payload: ReplyPayload) => {
        const text = payload.text ?? "";
        if (!text.trim()) return;
        const target = isGroup ? `group:${groupId}` : `user:${senderId}`;
        await helpers.sendText({ target, text });
        statusSink?.({ lastOutboundAt: Date.now() });
      },
    },
  });
}

function resolveSenderName(evt: OneBotMessageEvent): string | null {
  const sender = evt.sender ?? {};
  const name = sender.card?.trim() || sender.nickname?.trim();
  return name || null;
}


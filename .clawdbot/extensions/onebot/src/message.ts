type OneBotMessageSegment = {
  type?: string;
  data?: Record<string, unknown>;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseCqAt(segment: string): string | null {
  const match = segment.match(/^\[CQ:at,([^\]]+)\]$/i);
  if (!match) return null;
  const kv = match[1] ?? "";
  const idMatch = kv.match(/(?:^|,)(?:qq|id|uin)=([^,\]]+)/i);
  if (!idMatch) return null;
  return String(idMatch[1] ?? "").trim() || null;
}

function formatAt(qq: string): string {
  return qq.toLowerCase() === "all" ? "@all" : `@${qq}`;
}

function parseCqField(segment: string, key: string): string | null {
  // `segment` here is the inside of `[CQ:type,...]` without the trailing `]`,
  // so we only need to stop at the next comma.
  const match = segment.match(new RegExp(`(?:^|,)${key}=([^,]+)`, "i"));
  if (!match) return null;
  const value = String(match[1] ?? "").trim();
  return value || null;
}

function resolveCqMediaRef(segment: string): string {
  const candidates = ["url", "file", "path", "file_id", "id", "fid"];
  for (const key of candidates) {
    const value = parseCqField(segment, key);
    if (value) return value;
  }
  return "";
}

function resolveSegmentMediaRef(data: Record<string, unknown>): string {
  const candidates = ["url", "file", "path", "file_id", "id", "fid"];
  for (const key of candidates) {
    const raw = data[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number" && Number.isFinite(raw)) return String(raw);
  }
  return "";
}

function formatCqMedia(type: string, segment: string): string {
  const mediaRef = resolveCqMediaRef(segment);

  if (type === "image") return mediaRef ? `[image:${mediaRef}]` : "[image]";
  if (type === "record") return mediaRef ? `[voice:${mediaRef}]` : "[voice]";
  if (type === "video") return mediaRef ? `[video:${mediaRef}]` : "[video]";
  if (type === "file") return mediaRef ? `[file:${mediaRef}]` : "[file]";

  // QQ stickers (mface/marketface) are typically images; if we have a url/file, treat them as images.
  if (type === "mface" || type === "marketface") {
    return mediaRef ? `[image:${mediaRef}]` : "[sticker]";
  }

  // Built-in emoji (face) usually doesn't provide a stable media URL.
  if (type === "face") return "[emoji]";

  // Some bridges use non-standard CQ types with regular media fields.
  if (mediaRef) return `[image:${mediaRef}]`;

  return "[media]";
}

function stripCqCodes(input: string): string {
  return input
    .replace(/\[CQ:at,[^\]]+\]/gi, (seg) => {
      const qq = parseCqAt(seg);
      return qq ? formatAt(qq) : "";
    })
    .replace(/\[CQ:([^,\]]+),([^\]]*)\]/gi, (_all, rawType, rawSeg) => {
      const type = String(rawType ?? "").toLowerCase();
      const seg = String(rawSeg ?? "");
      if (type === "at") return "";
      return formatCqMedia(type, seg);
    })
    .replace(/\s+\n/g, "\n")
    .trim();
}

export function extractOneBotTextAndMentions(params: {
  message: unknown;
  selfId?: string | null;
}): { text: string; wasMentioned: boolean; hasAnyMention: boolean } {
  const selfId = params.selfId?.trim() || undefined;

  if (typeof params.message === "string") {
    const raw = params.message;
    const mentionSegments = [...raw.matchAll(/\[CQ:at,[^\]]+\]/gi)].map((m) => m[0]);
    const hasAnyMention = mentionSegments.length > 0;
    let wasMentioned = selfId ? mentionSegments.some((seg) => parseCqAt(seg) === selfId) : false;
    const text = stripCqCodes(raw);
    if (!wasMentioned && selfId && text.includes(`@${selfId}`)) {
      wasMentioned = true;
    }
    return { text, wasMentioned, hasAnyMention };
  }

  if (Array.isArray(params.message)) {
    const parts: string[] = [];
    let hasAnyMention = false;
    let wasMentioned = false;
    for (const entry of params.message) {
      const seg = entry as OneBotMessageSegment;
      const type = String(seg.type ?? "").trim().toLowerCase();
      const data = seg.data ?? {};
      if (type === "text") {
        const text = typeof data.text === "string" ? data.text : "";
        if (text) parts.push(text);
        continue;
      }
      if (type === "at") {
        const mentionId =
          typeof data.qq === "string" || typeof data.qq === "number"
            ? String(data.qq)
            : typeof data.id === "string" || typeof data.id === "number"
              ? String(data.id)
              : typeof data.uin === "string" || typeof data.uin === "number"
                ? String(data.uin)
                : "";
        if (mentionId) {
          hasAnyMention = true;
          if (selfId && mentionId === selfId) wasMentioned = true;
          parts.push(formatAt(mentionId));
        }
        continue;
      }
      if (["image", "record", "video", "file", "face", "mface", "marketface"].includes(type)) {
        const mediaRef = resolveSegmentMediaRef(data);
        if (type === "image") parts.push(mediaRef ? `[image:${mediaRef}]` : "[image]");
        else if (type === "record") parts.push(mediaRef ? `[voice:${mediaRef}]` : "[voice]");
        else if (type === "video") parts.push(mediaRef ? `[video:${mediaRef}]` : "[video]");
        else if (type === "file") parts.push(mediaRef ? `[file:${mediaRef}]` : "[file]");
        else if (type === "mface" || type === "marketface") {
          parts.push(mediaRef ? `[image:${mediaRef}]` : "[sticker]");
        } else if (type === "face") {
          parts.push("[emoji]");
        }
        continue;
      }

      // Fallback for non-standard segment types carrying regular media fields.
      const fallbackMediaRef = resolveSegmentMediaRef(data);
      if (fallbackMediaRef) {
        parts.push(`[image:${fallbackMediaRef}]`);
        continue;
      }
    }
    const text = parts.join("").trim();
    if (!wasMentioned && selfId && text.includes(`@${selfId}`)) {
      wasMentioned = true;
    }
    return { text, wasMentioned, hasAnyMention };
  }

  return { text: "", wasMentioned: false, hasAnyMention: false };
}

export type NormalizedOneBotTarget =
  | { kind: "user"; id: string }
  | { kind: "group"; id: string };

export function normalizeOneBotTarget(raw: string): NormalizedOneBotTarget | undefined {
  let normalized = raw.trim();
  if (!normalized) return undefined;

  const lowered = normalized.toLowerCase();
  for (const prefix of ["onebot:", "qq:", "napcat:"]) {
    if (lowered.startsWith(prefix)) {
      normalized = normalized.slice(prefix.length).trim();
      break;
    }
  }

  const cleaned = normalized.replace(/^(to|chat):/i, "").trim();
  const userMatch = cleaned.match(/^(user|private|dm):(.+)$/i);
  if (userMatch) {
    const id = (userMatch[2] ?? "").trim();
    return id ? { kind: "user", id } : undefined;
  }
  const groupMatch = cleaned.match(/^group:(.+)$/i);
  if (groupMatch) {
    const id = (groupMatch[1] ?? "").trim();
    return id ? { kind: "group", id } : undefined;
  }
  return undefined;
}


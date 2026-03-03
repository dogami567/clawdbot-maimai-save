import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

type MediaManifest = {
  lastCleanupDay?: string;
  items: Record<
    string,
    {
      path: string;
      lastSeenAt: number;
      mime?: string;
    }
  >;
};

const ROOT_DIR = path.resolve(process.cwd(), ".clawdbot", "data", "onebot-media");
const MANIFEST_PATH = path.join(ROOT_DIR, "manifest.json");
const RETAIN_MS = 24 * 60 * 60 * 1000;

function toUtcDay(value = Date.now()): string {
  return new Date(value).toISOString().slice(0, 10);
}

function guessExtension(params: { mime?: string; source: string }): string {
  const mime = (params.mime ?? "").toLowerCase();
  if (mime.includes("gif")) return ".gif";
  if (mime.includes("png")) return ".png";
  if (mime.includes("jpeg") || mime.includes("jpg")) return ".jpg";
  if (mime.includes("webp")) return ".webp";
  if (mime.includes("bmp")) return ".bmp";

  try {
    const ext = path.extname(new URL(params.source).pathname).toLowerCase();
    if ([".gif", ".png", ".jpg", ".jpeg", ".webp", ".bmp"].includes(ext)) {
      return ext === ".jpeg" ? ".jpg" : ext;
    }
  } catch {
    // ignore
  }

  return ".img";
}

async function readManifest(): Promise<MediaManifest> {
  try {
    const raw = await fs.readFile(MANIFEST_PATH, "utf8");
    const parsed = JSON.parse(raw) as MediaManifest;
    if (!parsed || typeof parsed !== "object") return { items: {} };
    if (!parsed.items || typeof parsed.items !== "object") return { items: {} };
    return parsed;
  } catch {
    return { items: {} };
  }
}

async function writeManifest(manifest: MediaManifest): Promise<void> {
  await fs.mkdir(ROOT_DIR, { recursive: true });
  await fs.writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupIfNeeded(manifest: MediaManifest): Promise<MediaManifest> {
  const today = toUtcDay();
  if (manifest.lastCleanupDay === today) return manifest;

  const now = Date.now();
  const nextItems: MediaManifest["items"] = {};

  for (const [hash, item] of Object.entries(manifest.items)) {
    const expired = now - item.lastSeenAt > RETAIN_MS;
    const exists = await fileExists(item.path);

    if (expired || !exists) {
      if (exists) {
        await fs.unlink(item.path).catch(() => undefined);
      }
      continue;
    }

    nextItems[hash] = item;
  }

  return {
    lastCleanupDay: today,
    items: nextItems,
  };
}

export async function resolveOneBotInboundImage(ref: string): Promise<string> {
  const trimmed = ref.trim();
  if (!/^https?:\/\//i.test(trimmed)) return trimmed;

  let manifest = await readManifest();
  manifest = await cleanupIfNeeded(manifest);

  try {
    const response = await fetch(trimmed, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) {
      await writeManifest(manifest);
      return trimmed;
    }

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length === 0) {
      await writeManifest(manifest);
      return trimmed;
    }

    const hash = createHash("sha256").update(buffer).digest("hex");
    const mime = response.headers.get("content-type") ?? undefined;
    const ext = guessExtension({ mime, source: trimmed });
    const filePath = path.join(ROOT_DIR, `${hash}${ext}`);

    await fs.mkdir(ROOT_DIR, { recursive: true });
    if (!(await fileExists(filePath))) {
      await fs.writeFile(filePath, buffer);
    }

    manifest.items[hash] = {
      path: filePath,
      lastSeenAt: Date.now(),
      mime,
    };

    await writeManifest(manifest);
    return filePath;
  } catch {
    await writeManifest(manifest);
    return trimmed;
  }
}

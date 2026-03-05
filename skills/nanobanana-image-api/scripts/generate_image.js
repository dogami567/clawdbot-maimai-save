#!/usr/bin/env node
"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const DEFAULTS = {
  baseUrl: "https://api.linkapi.org",
  proxyUrl: "",
  mode: "txt2img",
  model: "nano-banana-2-4k",
  outputDir: path.resolve(process.cwd(), "outputs"),
  outputPrefix: "nanobanana",
  timeoutMs: 600000,
};

const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

function printHelp() {
  const message = `
Generate images using Nano Banana or Gemini API.

Usage:
  node generate_image.js --mode txt2img --prompt "..." --output-dir "..."
  node generate_image.js --mode img2img --prompt "..." --input-image "a.jpg" --output-dir "..."

Required:
  --prompt                  Prompt text. When omitted, set --auto-prompt true and --subject.
  --output-dir              Directory where result images are saved.

Optional:
  --mode                    txt2img | img2img (default: ${DEFAULTS.mode})
  --provider                nanobanana | gemini (auto-inferred from model when omitted)
  --model                   Model id (default: ${DEFAULTS.model})
  --api-key                 API key. Fallback envs: NANOBANANA_API_KEY, GEMINI_API_KEY, IMAGE_API_KEY, OPENAI_API_KEY
  --base-url                API origin (default: ${DEFAULTS.baseUrl}; env fallback: API_BASE_URL)
  --proxy-url               Optional proxy endpoint (env fallback: API_PROXY_URL), e.g. http://localhost:49915/api/proxy
  --input-image             Path to input image. Repeatable or comma-separated.
  --auto-prompt             true|false to enable local prompt enhancement
  --subject                 Subject used when prompt is missing
  --style                   Style hint for auto prompt
  --framing                 Composition hint for auto prompt
  --lighting                Lighting hint for auto prompt
  --quality                 Quality hint for auto prompt
  --palette                 Color palette hint for auto prompt
  --negative                Negative constraints for auto prompt
  --image-size              Gemini image size hint, e.g. 1K | 2K | 4K
  --output-prefix           Output file prefix (default: ${DEFAULTS.outputPrefix})
  --save-metadata           true|false (default: true)
  --timeout-ms              Request timeout in milliseconds (default: ${DEFAULTS.timeoutMs})
  --help                    Show this message

Examples:
  node generate_image.js --mode txt2img --provider nanobanana --api-key "$env:NANOBANANA_API_KEY" --prompt "A poster of a cyber banana chef" --auto-prompt true --output-dir "D:\\\\workspace\\\\image-output"
  node generate_image.js --mode img2img --provider gemini --api-key "$env:GEMINI_API_KEY" --model gemini-2.5-flash-image --prompt "Turn this into a clean studio ad" --input-image "D:\\\\workspace\\\\input\\\\sample.jpg" --image-size 2K --output-dir "D:\\\\workspace\\\\image-output"
`;
  process.stdout.write(message.trimStart());
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const trimmed = token.slice(2);
    const eqIndex = trimmed.indexOf("=");
    let key = "";
    let value = "";

    if (eqIndex >= 0) {
      key = trimmed.slice(0, eqIndex);
      value = trimmed.slice(eqIndex + 1);
    } else {
      key = trimmed;
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        value = "true";
      } else {
        value = next;
        i += 1;
      }
    }

    if (key === "input-image") {
      if (!Array.isArray(args[key])) args[key] = [];
      args[key].push(value);
      continue;
    }

    args[key] = value;
  }
  return args;
}

function toBoolean(raw, defaultValue) {
  if (raw === undefined || raw === null || raw === "") {
    return defaultValue;
  }
  const value = String(raw).trim().toLowerCase();
  if (["1", "true", "yes", "y", "on"].includes(value)) return true;
  if (["0", "false", "no", "n", "off"].includes(value)) return false;
  return defaultValue;
}

function normalizeBaseUrl(baseUrl) {
  let url = String(baseUrl || DEFAULTS.baseUrl).trim();
  if (!url) url = DEFAULTS.baseUrl;
  url = url.replace(/\/+$/, "");
  url = url.replace(/\/v1beta(?:\/.*)?$/i, "");
  url = url.replace(/\/v1(?:\/.*)?$/i, "");
  return url;
}

function collectInputImagePaths(argValue) {
  if (!argValue) return [];
  const list = Array.isArray(argValue) ? argValue : [argValue];
  const normalized = [];
  for (const item of list) {
    const parts = String(item)
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    normalized.push(...parts);
  }
  return normalized;
}

function sanitizePrefix(rawPrefix) {
  const value = String(rawPrefix || DEFAULTS.outputPrefix).trim();
  return (value || DEFAULTS.outputPrefix).replace(/[^\w-]/g, "_");
}

function inferProvider(model, explicitProvider) {
  if (explicitProvider) {
    const normalized = String(explicitProvider).trim().toLowerCase();
    if (normalized === "nanobanana" || normalized === "gemini") {
      return normalized;
    }
    throw new Error("Invalid --provider value. Use nanobanana or gemini.");
  }
  const lower = String(model || "").toLowerCase();
  return lower.includes("nano-banana") ? "nanobanana" : "gemini";
}

function resolveApiKey(args) {
  return (
    args["api-key"] ||
    process.env.NANOBANANA_API_KEY ||
    process.env.GEMINI_API_KEY ||
    process.env.IMAGE_API_KEY ||
    process.env.OPENAI_API_KEY ||
    ""
  )
    .toString()
    .trim();
}

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/png";
}

function extensionFromMime(mimeType) {
  const normalized = String(mimeType || "image/png")
    .split(";")[0]
    .trim()
    .toLowerCase();
  return EXT_BY_MIME[normalized] || "png";
}

function fileToInlineData(filePath) {
  const absolutePath = path.resolve(filePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Input image not found: ${absolutePath}`);
  }
  const fileBuffer = fs.readFileSync(absolutePath);
  return {
    path: absolutePath,
    mimeType: guessMimeType(absolutePath),
    data: fileBuffer.toString("base64"),
  };
}

function buildPrompt(basePrompt, args) {
  const primary = String(basePrompt || "").trim();
  const subject = String(args.subject || "").trim();
  const seed = primary || subject || "A polished visual concept";

  if (!toBoolean(args["auto-prompt"], false)) {
    return seed;
  }

  const style = String(args.style || "photorealistic cinematic").trim();
  const framing = String(
    args.framing || "balanced composition, clear focal subject"
  ).trim();
  const lighting = String(args.lighting || "soft film lighting").trim();
  const quality = String(
    args.quality || "high detail, clean edges, rich texture"
  ).trim();
  const palette = String(args.palette || "").trim();
  const negative = String(args.negative || "").trim();

  const segments = [
    `${seed}.`,
    `Style: ${style}.`,
    `Composition: ${framing}.`,
    `Lighting: ${lighting}.`,
    `Quality: ${quality}.`,
  ];

  if (palette) {
    segments.push(`Palette: ${palette}.`);
  }
  if (negative) {
    segments.push(`Avoid: ${negative}.`);
  }

  return segments.join(" ").replace(/\s+/g, " ").trim();
}

function normalizeMessageText(content) {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item.text === "string") return item.text;
        if (
          item &&
          item.type === "image_url" &&
          item.image_url &&
          typeof item.image_url.url === "string"
        ) {
          return item.image_url.url;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (content && typeof content === "object" && typeof content.text === "string") {
    return content.text;
  }
  return "";
}

function extractImageUrls(text) {
  if (!text) return [];
  const urls = new Set();
  const markdownRegex = /!\[[^\]]*]\((https?:\/\/[^\s)]+)\)/g;
  const plainRegex = /https?:\/\/[^\s)]+/g;
  let match = null;

  while ((match = markdownRegex.exec(text)) !== null) {
    urls.add(match[1]);
  }

  while ((match = plainRegex.exec(text)) !== null) {
    urls.add(match[0].replace(/[),.;]+$/, ""));
  }

  return [...urls];
}

function extractDataUrls(text) {
  if (!text) return [];
  const values = [];
  const regex = /data:image\/[A-Za-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/g;
  let match = null;
  while ((match = regex.exec(text)) !== null) {
    values.push(match[0]);
  }
  return values;
}

function parseDataUrl(dataUrl) {
  const match = String(dataUrl).match(/^data:([^;]+);base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1],
    data: match[2],
  };
}

function createTimeoutSignal(timeoutMs) {
  if (
    typeof AbortSignal !== "undefined" &&
    typeof AbortSignal.timeout === "function"
  ) {
    return AbortSignal.timeout(timeoutMs);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function normalizeProxyUrl(proxyUrl) {
  if (!proxyUrl) return "";
  const trimmed = String(proxyUrl).trim();
  if (!trimmed) return "";
  return trimmed.replace(/\/+$/, "");
}

async function fetchViaOptionalProxy(targetUrl, options, timeoutMs, proxyUrl) {
  const normalizedProxyUrl = normalizeProxyUrl(proxyUrl);
  if (!normalizedProxyUrl) {
    return await fetch(targetUrl, {
      ...options,
      signal: createTimeoutSignal(timeoutMs),
    });
  }

  const method = String((options && options.method) || "GET").toUpperCase();
  const headers = (options && options.headers) || {};
  const rawBody = options && Object.prototype.hasOwnProperty.call(options, "body")
    ? options.body
    : undefined;

  let jsonBody = undefined;
  if (rawBody !== undefined && rawBody !== null && method !== "GET") {
    if (typeof rawBody === "string") {
      try {
        jsonBody = JSON.parse(rawBody);
      } catch (_) {
        jsonBody = rawBody;
      }
    } else {
      jsonBody = rawBody;
    }
  }

  const payload = {
    targetUrl: targetUrl,
    method,
    headers,
    body: jsonBody,
  };

  return await fetch(normalizedProxyUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: createTimeoutSignal(timeoutMs),
  });
}

async function fetchJson(url, options, timeoutMs, proxyUrl) {
  const response = await fetchViaOptionalProxy(url, options, timeoutMs, proxyUrl);

  const rawText = await response.text();
  let payload = {};
  try {
    payload = rawText ? JSON.parse(rawText) : {};
  } catch (_) {
    payload = { raw: rawText };
  }

  if (!response.ok) {
    const message =
      (payload &&
        payload.error &&
        (payload.error.message || payload.error.code || payload.error)) ||
      rawText ||
      "Unknown error";
    throw new Error(`Request failed (${response.status}): ${message}`);
  }

  return payload;
}

async function fetchImageFromUrl(url, timeoutMs, proxyUrl) {
  const response = await fetchViaOptionalProxy(
    url,
    { method: "GET", headers: {} },
    timeoutMs,
    proxyUrl
  );

  if (!response.ok) {
    throw new Error(`Image download failed (${response.status}): ${url}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const mimeType =
    String(response.headers.get("content-type") || "image/png")
      .split(";")[0]
      .trim() || "image/png";

  return { mimeType, buffer };
}

async function callGeminiApi({
  apiKey,
  proxyUrl,
  baseUrl,
  model,
  prompt,
  inputImages,
  imageSize,
  timeoutMs,
}) {
  const origin = normalizeBaseUrl(baseUrl);
  const endpoint = `${origin}/v1beta/models/${model}:generateContent`;

  const parts = [{ text: prompt }];
  for (const image of inputImages) {
    parts.push({
      inlineData: {
        mimeType: image.mimeType,
        data: image.data,
      },
    });
  }

  const generationConfig = {
    temperature: 0.7,
    topK: 32,
    topP: 1,
    maxOutputTokens: 4096,
    responseModalities: ["TEXT", "IMAGE"],
  };
  if (imageSize) {
    generationConfig.imageConfig = { imageSize };
  }

  const payload = {
    contents: [{ role: "user", parts }],
    generationConfig,
  };

  const result = await fetchJson(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-goog-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
    proxyUrl
  );

  const textChunks = [];
  const images = [];
  const candidates = Array.isArray(result.candidates) ? result.candidates : [];

  for (const candidate of candidates) {
    const candidateParts =
      candidate && candidate.content && Array.isArray(candidate.content.parts)
        ? candidate.content.parts
        : [];
    for (const part of candidateParts) {
      if (typeof part.text === "string" && part.text.trim()) {
        textChunks.push(part.text.trim());
      }
      const inline = part.inlineData || part.inline_data;
      if (inline && inline.data) {
        images.push({
          mimeType: inline.mimeType || inline.mime_type || "image/png",
          data: inline.data,
        });
      }
    }
  }

  return {
    text: textChunks.join("\n").trim(),
    images,
    raw: result,
  };
}

async function callNanoBananaApi({
  apiKey,
  proxyUrl,
  baseUrl,
  model,
  prompt,
  inputImages,
  timeoutMs,
}) {
  const origin = normalizeBaseUrl(baseUrl);
  const endpoint = `${origin}/v1/chat/completions`;

  const userContent = [{ type: "text", text: prompt }];
  for (const image of inputImages) {
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${image.mimeType};base64,${image.data}`,
      },
    });
  }

  const payload = {
    model,
    messages: [{ role: "user", content: userContent }],
  };

  const result = await fetchJson(
    endpoint,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    },
    timeoutMs,
    proxyUrl
  );

  const choice = Array.isArray(result.choices) ? result.choices[0] : null;
  const rawContent = choice && choice.message ? choice.message.content : "";
  const text = normalizeMessageText(rawContent);
  const images = [];

  if (Array.isArray(result.data)) {
    for (const item of result.data) {
      if (item && item.b64_json) {
        images.push({
          mimeType: "image/png",
          data: item.b64_json,
        });
      }
    }
  }

  for (const value of extractDataUrls(text)) {
    const parsed = parseDataUrl(value);
    if (parsed) images.push(parsed);
  }

  for (const url of extractImageUrls(text)) {
    try {
      const downloaded = await fetchImageFromUrl(url, timeoutMs, proxyUrl);
      images.push(downloaded);
    } catch (error) {
      process.stderr.write(
        `[warn] Failed to download image URL: ${url} (${error.message})\n`
      );
    }
  }

  return { text, images, raw: result };
}

function ensureDir(dirPath) {
  const absolutePath = path.resolve(dirPath);
  fs.mkdirSync(absolutePath, { recursive: true });
  return absolutePath;
}

function saveImages(images, outputDir, outputPrefix) {
  const finalDir = ensureDir(outputDir);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const savedFiles = [];

  for (let i = 0; i < images.length; i += 1) {
    const image = images[i];
    const mimeType = String(image.mimeType || "image/png")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const extension = extensionFromMime(mimeType);

    let buffer = null;
    if (image.buffer) {
      buffer = Buffer.from(image.buffer);
    } else if (image.data) {
      buffer = Buffer.from(image.data, "base64");
    }
    if (!buffer || buffer.length === 0) {
      continue;
    }

    const hash = crypto.createHash("sha1").update(buffer).digest("hex").slice(0, 8);
    const fileName = `${outputPrefix}_${stamp}_${String(i + 1).padStart(
      2,
      "0"
    )}_${hash}.${extension}`;
    const filePath = path.join(finalDir, fileName);
    fs.writeFileSync(filePath, buffer);
    savedFiles.push(filePath);
  }

  return savedFiles;
}

function writeMetadataFile(outputDir, outputPrefix, payload) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = path.join(outputDir, `${outputPrefix}_${stamp}_meta.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return filePath;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h) {
    printHelp();
    return;
  }

  const mode = String(args.mode || DEFAULTS.mode).toLowerCase();
  if (mode !== "txt2img" && mode !== "img2img") {
    throw new Error("Invalid --mode value. Use txt2img or img2img.");
  }

  const model = String(args.model || DEFAULTS.model).trim();
  const provider = inferProvider(model, args.provider);
  const baseUrl = normalizeBaseUrl(
    args["base-url"] || process.env.API_BASE_URL || DEFAULTS.baseUrl
  );
  const proxyUrl = normalizeProxyUrl(
    args["proxy-url"] || process.env.API_PROXY_URL || DEFAULTS.proxyUrl
  );
  const apiKey = resolveApiKey(args);
  const timeoutMs = Number.parseInt(
    String(args["timeout-ms"] || DEFAULTS.timeoutMs),
    10
  );
  const outputDir = path.resolve(String(args["output-dir"] || DEFAULTS.outputDir));
  const outputPrefix = sanitizePrefix(args["output-prefix"] || DEFAULTS.outputPrefix);
  const imageSize = String(args["image-size"] || "").trim();
  const saveMetadata = toBoolean(args["save-metadata"], true);
  const inputImagePaths = collectInputImagePaths(args["input-image"]);
  const promptInput = String(args.prompt || "").trim();
  const finalPrompt = buildPrompt(promptInput, args);

  if (!apiKey) {
    throw new Error("API key is required. Pass --api-key or set env variable.");
  }
  if (!finalPrompt) {
    throw new Error("Prompt is required. Pass --prompt or enable --auto-prompt with --subject.");
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new Error("Invalid --timeout-ms value.");
  }
  if (mode === "img2img" && inputImagePaths.length === 0) {
    throw new Error("img2img mode requires at least one --input-image.");
  }

  const inputImages = inputImagePaths.map(fileToInlineData);

  const response =
    provider === "gemini"
      ? await callGeminiApi({
          apiKey,
          proxyUrl,
          baseUrl,
          model,
          prompt: finalPrompt,
          inputImages,
          imageSize,
          timeoutMs,
        })
      : await callNanoBananaApi({
          apiKey,
          proxyUrl,
          baseUrl,
          model,
          prompt: finalPrompt,
          inputImages,
          timeoutMs,
        });

  if (!Array.isArray(response.images) || response.images.length === 0) {
    throw new Error("API returned no image payload.");
  }

  const savedFiles = saveImages(response.images, outputDir, outputPrefix);
  if (savedFiles.length === 0) {
    throw new Error("Failed to save output images.");
  }

  const result = {
    ok: true,
    mode,
    provider,
    model,
    baseUrl,
    proxyUrl,
    generatedAt: new Date().toISOString(),
    promptInput,
    promptFinal: finalPrompt,
    inputImages: inputImagePaths.map((p) => path.resolve(p)),
    savedFiles,
    responseText: response.text || "",
  };

  if (saveMetadata) {
    result.metadataFile = writeMetadataFile(outputDir, outputPrefix, result);
  }

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  const payload = {
    ok: false,
    error: error && error.message ? error.message : String(error),
  };
  process.stderr.write(`${JSON.stringify(payload, null, 2)}\n`);
  process.exit(1);
});

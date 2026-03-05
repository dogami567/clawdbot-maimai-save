---
name: xiaodoubao-skill
description: Call LinkAPI (https://api.linkapi.org) as an OpenAI-compatible relay for chat, responses, image, and transcription requests. Use when the user asks to route model calls through XiaoDouBao/LinkAPI, configure API keys, test connectivity, or troubleshoot relay errors.
---

# Xiaodoubao Skill

Use this skill to wire and validate LinkAPI as a model relay.

## Key Handling

1. Never print API keys in replies.
2. Prefer storing the key in an env var, for example `LINKAPI_API_KEY`.
3. If the user pastes a key in chat, use it only for the requested setup and redact it from logs/results.

## Base Configuration

Use OpenAI-compatible settings:

- Base URL: `https://api.linkapi.org/v1`
- Auth header: `Authorization: Bearer <LINKAPI_API_KEY>`
- Content-Type: `application/json`

## Smoke Test (Chat Completions)

Run this request shape first to verify auth + model routing:

```bash
curl -sS https://api.linkapi.org/v1/chat/completions \
  -H "Authorization: Bearer $LINKAPI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [
      {"role":"user","content":"Say hi in one short sentence."}
    ],
    "temperature": 0.2
  }'
```

If the model id is unavailable, ask the user for preferred model ids and retry.

## Common Call Shapes

Use OpenAI-compatible endpoints and payloads:

1. Text chat: `POST /v1/chat/completions`
2. Responses API: `POST /v1/responses`
3. Images: `POST /v1/images/generations`
4. Transcription: `POST /v1/audio/transcriptions`

## Verified Model IDs (2026-03-03)

Use these known-good ids for quick routing checks:

- Gemini high-thinking: `gemini-3.1-pro-preview-thinking-high`
- GPT high-thinking: `gpt-5.2-thinking`
- Claude high-thinking: `claude-opus-4-5-20251101-thinking`
- Nano Banana image: `nano-banana-2-2k` (works), `nano-banana-2` (works), `nano-banana` (works)
- Note: `nanobanana-3.1-fast` is not available on current channel; map to `nano-banana-2-2k` or `nano-banana-2`.

## Troubleshooting

1. `401/403`: key invalid, missing, or not authorized for the model.
2. `404`: wrong path or model id not found.
3. `429`: quota/rate limit; back off and retry with lower concurrency.
4. `5xx`: upstream instability; retry with jitter and provide fallback model.

## Clawdbot Integration Notes

When the user wants Clawdbot model routing through LinkAPI, apply provider config with:

- `baseUrl`: `https://api.linkapi.org/v1`
- `api`: use OpenAI-compatible mode
- `apiKey`: from secret/env, never hardcoded in shared files

Return masked config examples and keep sensitive values redacted.

## OneBot Stable Image Delivery (Mandatory)

For OneBot/QQ delivery, use this exact rule to avoid flaky sends:

1. Generate image via LinkAPI and prefer the returned `data[0].url`.
2. Send with `message` tool using `media=<https url>`.
3. Do **not** send OneBot images with `filePath` or local absolute paths (e.g. `/home/...`) because NapCat cannot access Clawdbot host files and returns `识别URL失败` or `ENOENT`.
4. If API returns `b64_json` without URL, first upload/host it to an HTTP URL, then send that URL via `media`.

### Quick SOP (OneBot)

- Generate: `POST /v1/images/generations`
- Parse response:
  - if `data[0].url` exists -> use directly
  - else if `data[0].b64_json` exists -> convert + host, then use hosted URL
- Send:
  - `message(action=send, channel=onebot, target=group:<id>|user:<id>, media=<url>, message=<optional caption>)`

### Troubleshooting Map

- `invalid_request: 无效的令牌`: wrong/expired LinkAPI token; verify active key source.
- `OneBot ... 识别URL失败`: attempted local path; switch to `media` URL.
- `OneBot ... ENOENT copyfile`: NapCat side cannot read host file path; use URL flow only.

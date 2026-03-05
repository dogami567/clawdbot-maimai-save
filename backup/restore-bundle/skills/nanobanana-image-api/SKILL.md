---
name: nanobanana-image-api
description: Generate images through Nano Banana or Gemini APIs with reusable CLI workflows for text-to-image and image-to-image, while the AI agent runs an iterative self-loop (write prompt, generate, inspect result, revise prompt) until the user goal is met. Use when users ask for API-based image creation/editing, prompt drafting, quality iteration, and saving outputs to specific paths.
---

# Nanobanana Image Api

Use this skill to run API image generation workflows end-to-end: prompt drafting, request execution, file saving, and result retrieval.

## Workflow

1. Collect target goal and hard constraints from user.
2. Draft an initial prompt.
3. Execute one generation round with `scripts/generate_image.js`.
4. Read output files and inspect generated images.
5. Decide pass/fail against the goal.
6. If fail, revise prompt and run next round.
7. Stop when goal is met or iteration budget is exhausted.

## AI Self-Loop Protocol

Use AI-driven loop by default. Do not rely on script-level auto loop.

1. Define acceptance criteria in plain text before first round.
2. Run one generation command.
3. Inspect one or more saved files with `view_image`.
4. Score result against acceptance criteria.
5. Rewrite prompt with concrete deltas.
6. Repeat from step 2.

Use this stop rule:
- Stop immediately once criteria are met.
- Otherwise stop at max 5 rounds and return best round plus gap analysis.

## Inputs To Collect

- `goal`: what "done" looks like
- `mode`: `txt2img` or `img2img`
- `provider`: `nanobanana` or `gemini`
- `api_key`: use `--api-key` or env var
- `model`: image-capable model id
- `prompt`: user intent; allow auto enhancement with `--auto-prompt`
- `input_image`: required for `img2img`
- `output_dir`: required whenever user asks for explicit save location

## Recommended Models (LinkAPI)

Default to these model ids to avoid 404/removed models:

- Default (Gemini, good quality/compat): `gemini-3.1-flash-image-preview`
- Quality upgrade (Nano Banana 2K): `nano-banana-2-2k`
- Highest quality (Nano Banana 4K): `nano-banana-2-4k`

Notes:
- `nanobanana-image-2k` is no longer present in the LinkAPI `/v1/models` list (removed/renamed). Use `nano-banana-2-2k` instead.

## Run Commands

Use `scripts/generate_image.js` for all requests.

```powershell
node "$env:CODEX_HOME\\skills\\nanobanana-image-api\\scripts\\generate_image.js" `
  --mode txt2img `
  --provider nanobanana `
  --api-key $env:NANOBANANA_API_KEY `
  --model nano-banana-2-4k `
  --prompt "A fashion poster of a banana mascot in city neon rain" `
  --auto-prompt true `
  --output-dir "F:\\xiangmu\\nano出图+skill\\output\\demo\\v001"
```

```powershell
node "$env:CODEX_HOME\\skills\\nanobanana-image-api\\scripts\\generate_image.js" `
  --mode img2img `
  --provider gemini `
  --api-key $env:GEMINI_API_KEY `
  --model gemini-3.1-flash-image-preview `
  --prompt "Turn this product photo into a premium studio ad" `
  --input-image "D:\workspace\input\sample.jpg" `
  --auto-prompt true `
  --image-size 2K `
  --output-dir "F:\\xiangmu\\nano出图+skill\\output\\demo\\v001"
```

### Local Proxy (Recommended)

If you have the Nano Banana release app running locally (e.g. `http://localhost:49915/`), route traffic through its proxy to reduce fetch/TLS issues:

```powershell
node "$env:CODEX_HOME\\skills\\nanobanana-image-api\\scripts\\generate_image.js" `
  --mode img2img `
  --provider gemini `
  --model gemini-3-pro-image-preview `
  --proxy-url "http://localhost:49915/api/proxy" `
  --base-url "https://api.linkapi.org" `
  --prompt "..." `
  --input-image "F:\\path\\to\\input.jpg" `
  --image-size 2K `
  --output-dir "F:\\xiangmu\\nano出图+skill\\output\\job\\v001"
```

## Prompt Drafting Rules

1. Use `references/prompt-patterns.md` when prompt quality is unclear.
2. Start with subject, then style, composition, lighting, and constraints.
3. Enable `--auto-prompt true` to apply local prompt enhancement.
4. Keep prompt intent aligned with user objective and supplied reference images.

## Result Handling

1. Parse script stdout JSON.
2. Read `savedFiles` and `metadataFile`.
3. Use `view_image` on one or more saved paths when visual confirmation is required.
4. Record round summary: `prompt`, `files`, `pass/fail`, and `reason`.
5. Return best prompt and final saved paths to the user.

## Batch Mode Constraint

If batch-processing mode is requested in the future, enforce all of the following:

1. Judge model must be `gemini-3.1-pro-preview` or newer.
2. Judge/generation traffic must go through `https://api.linkapi.org`.
3. Use the same LinkAPI key channel as normal generation.
4. Keep this as optional mode; default remains AI self-loop.

## Error Handling

1. If response has no image payload, switch provider or model and retry.
2. If auth fails, validate key and base URL first.
3. If `img2img` fails, validate file path and MIME compatibility.
4. If save fails, create output directory and retry with absolute path.

## Resources

- `scripts/generate_image.js`: unified txt2img/img2img CLI.
- `references/prompt-patterns.md`: reusable prompt templates and examples.

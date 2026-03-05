#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const key = argv[i];
    const next = argv[i + 1];
    if (!key.startsWith('--')) continue;
    if (next && !next.startsWith('--')) {
      out[key] = next;
      i += 1;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

const args = parseArgs(process.argv);
const briefFile = args['--brief-file'];
if (!briefFile || typeof briefFile !== 'string') {
  console.error('Missing --brief-file <path>');
  process.exit(1);
}

const templateFile =
  typeof args['--template-file'] === 'string'
    ? args['--template-file']
    : '.codex/skills/gemini-skill/references/gemini.prompt.template.md';

const outFile =
  typeof args['--out-file'] === 'string' ? args['--out-file'] : 'out/gemini/prompt.md';

const briefPath = path.resolve(process.cwd(), briefFile);
const templatePath = path.resolve(process.cwd(), templateFile);
const outPath = path.resolve(process.cwd(), outFile);

if (!fs.existsSync(briefPath)) {
  console.error(`Brief file not found: ${briefPath}`);
  process.exit(1);
}
if (!fs.existsSync(templatePath)) {
  console.error(`Template file not found: ${templatePath}`);
  process.exit(1);
}

let briefJson;
try {
  const raw = fs.readFileSync(briefPath, 'utf8');
  briefJson = JSON.parse(raw);
} catch (err) {
  console.error(`Failed to parse JSON brief: ${briefPath}`);
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
}

const template = fs.readFileSync(templatePath, 'utf8');
const pretty = JSON.stringify(briefJson, null, 2);

const marker = '{{UI_BRIEF_JSON}}';
if (!template.includes(marker)) {
  console.error(`Template missing marker ${marker}: ${templatePath}`);
  process.exit(1);
}

const prompt = template.replace(marker, pretty);
ensureDir(path.dirname(outPath));
fs.writeFileSync(outPath, prompt, 'utf8');
console.log(`[OK] Prompt generated: ${outPath}`);


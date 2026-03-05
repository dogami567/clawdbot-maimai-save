#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

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

function timestamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

const args = parseArgs(process.argv);
const promptFile = args['--prompt-file'];
if (!promptFile || typeof promptFile !== 'string') {
  console.error('Missing --prompt-file <path>');
  process.exit(1);
}

const outputFormat = typeof args['--output-format'] === 'string' ? args['--output-format'] : 'text';

const promptPath = path.resolve(process.cwd(), promptFile);
if (!fs.existsSync(promptPath)) {
  console.error(`Prompt file not found: ${promptPath}`);
  process.exit(1);
}

const prompt = fs.readFileSync(promptPath, 'utf8');
if (!prompt.trim()) {
  console.error('Prompt file is empty.');
  process.exit(1);
}

const outDir = path.resolve(process.cwd(), args['--out-dir'] || 'out/gemini');
ensureDir(outDir);
const outPath = path.join(outDir, `${timestamp()}.txt`);

const isWindows = process.platform === 'win32';
const command = isWindows ? (process.env.ComSpec || 'cmd.exe') : 'gemini';
const commandArgs = isWindows
  ? ['/d', '/s', '/c', `gemini --output-format ${outputFormat}`]
  : ['--output-format', outputFormat];

const child = spawn(command, commandArgs, {
  env: { ...process.env, NO_COLOR: '1' },
  stdio: ['pipe', 'pipe', 'pipe'],
});

const stdout = [];
const stderr = [];

child.stdout.on('data', (chunk) => stdout.push(Buffer.from(chunk)));
child.stderr.on('data', (chunk) => stderr.push(Buffer.from(chunk)));

child.on('error', (err) => {
  console.error(`Failed to run gemini: ${err.message}`);
  process.exit(1);
});

child.on('close', (code) => {
  const outText =
    `# prompt: ${promptPath}\n` +
    `# exitCode: ${code}\n\n` +
    `## STDOUT\n\n` +
    Buffer.concat(stdout).toString('utf8') +
    `\n\n## STDERR\n\n` +
    Buffer.concat(stderr).toString('utf8');

  fs.writeFileSync(outPath, outText, 'utf8');

  const exitCode = typeof code === 'number' ? code : 0;
  const stderrText = Buffer.concat(stderr).toString('utf8');

  if (exitCode !== 0) {
    console.error(`[ERR] Gemini exited with code ${exitCode}. Output saved: ${outPath}`);
    const notFoundHints = ['not recognized', '不是内部或外部命令', '无法将“gemini”项识别', 'cannot find', 'not found'];
    if (notFoundHints.some((h) => stderrText.toLowerCase().includes(h.toLowerCase()))) {
      console.error('\nGemini CLI not found on PATH. Quick fix (Windows):');
      console.error('- Check `npm prefix -g` and add it to PATH (restart terminal after).');
      console.error('- Then verify: `gemini --version`');
      console.error('- If installed but still missing: `where gemini`');
    }
  } else {
    console.log(`[OK] Gemini output saved: ${outPath}`);
  }
  process.exit(code ?? 0);
});

child.stdin.write(prompt);
child.stdin.end();

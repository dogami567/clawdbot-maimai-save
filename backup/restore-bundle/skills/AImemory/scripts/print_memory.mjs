#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function getCodexHome() {
  const envHome = (process.env.CODEX_HOME || '').trim();
  if (envHome) return envHome;
  return path.join(os.homedir(), '.codex');
}

const codexHome = getCodexHome();
const memoryPath = path.join(codexHome, 'memory', 'AImemory.json');

if (!fs.existsSync(memoryPath)) {
  console.error(`[ERR] Memory file not found: ${memoryPath}`);
  console.error('Run: node .codex/skills/AImemory/scripts/ensure_memory.mjs');
  process.exit(1);
}

const raw = fs.readFileSync(memoryPath, 'utf8');
console.log(`PATH: ${memoryPath}\n`);
console.log(raw);


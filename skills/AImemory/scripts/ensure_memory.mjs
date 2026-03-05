#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function getCodexHome() {
  const envHome = (process.env.CODEX_HOME || '').trim();
  if (envHome) return envHome;
  return path.join(os.homedir(), '.codex');
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function readTemplate() {
  const templatePath = path.resolve(
    process.cwd(),
    '.codex/skills/AImemory/references/memory.template.json'
  );
  const raw = fs.readFileSync(templatePath, 'utf8');
  return JSON.parse(raw);
}

const codexHome = getCodexHome();
const memoryDir = path.join(codexHome, 'memory');
const memoryPath = path.join(memoryDir, 'AImemory.json');

ensureDir(memoryDir);

if (!fs.existsSync(memoryPath)) {
  const template = readTemplate();
  template.updatedAt = new Date().toISOString();
  fs.writeFileSync(memoryPath, JSON.stringify(template, null, 2) + '\n', 'utf8');
  console.log(`[OK] Created: ${memoryPath}`);
} else {
  console.log(`[OK] Exists: ${memoryPath}`);
}

console.log(`CODEX_HOME=${codexHome}`);


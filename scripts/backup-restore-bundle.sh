#!/usr/bin/env bash
set -euo pipefail

ROOT="/home/node/clawd"
BUNDLE_DIR="$ROOT/backup/restore-bundle"
STAMP="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

safe_sync_dir() {
  local src="$1"
  local dest="$2"
  mkdir -p "$dest"
  find "$dest" -mindepth 1 -delete
  cp -a "$src"/. "$dest"/
}

safe_sync_filtered_memory() {
  local src="$1"
  local dest="$2"
  mkdir -p "$dest"
  find "$dest" -mindepth 1 -delete
  find "$src" -mindepth 1 -maxdepth 1 -type f -name '*.md' -exec cp -a {} "$dest"/ \;
  for sub in weekly monthly; do
    if [ -d "$src/$sub" ]; then
      mkdir -p "$dest/$sub"
      cp -a "$src/$sub"/. "$dest/$sub"/
    fi
  done
}

mkdir -p "$BUNDLE_DIR/config" "$BUNDLE_DIR/memory" "$BUNDLE_DIR/meta"

for file in AGENTS.md SOUL.md USER.md IDENTITY.md TOOLS.md MEMORY.md; do
  if [ -f "$ROOT/$file" ]; then
    cp -f "$ROOT/$file" "$BUNDLE_DIR/$file"
  fi
done

if [ -d "$ROOT/memory" ]; then
  safe_sync_filtered_memory "$ROOT/memory" "$BUNDLE_DIR/memory"
fi

mkdir -p "$BUNDLE_DIR/skills" "$BUNDLE_DIR/extensions" "$BUNDLE_DIR/scripts"
if [ -d "$ROOT/skills" ]; then
  safe_sync_dir "$ROOT/skills" "$BUNDLE_DIR/skills"
  find "$BUNDLE_DIR/skills" -type d -name node_modules -prune -exec rm -rf {} +
fi
if [ -d "$ROOT/.clawdbot/extensions" ]; then
  safe_sync_dir "$ROOT/.clawdbot/extensions" "$BUNDLE_DIR/extensions"
  find "$BUNDLE_DIR/extensions" -type d -name node_modules -prune -exec rm -rf {} +
fi
if [ -d "$ROOT/scripts" ]; then
  safe_sync_dir "$ROOT/scripts" "$BUNDLE_DIR/scripts"
fi

if [ -f "/home/node/.clawdbot/clawdbot.json" ]; then
  node <<'NODE' >/tmp/clawdbot.sanitized.json
const fs = require('fs');
const source = '/home/node/.clawdbot/clawdbot.json';
const raw = fs.readFileSync(source, 'utf8');
const data = JSON.parse(raw);

const denyFragments = [
  'key', 'token', 'secret', 'password', 'pass', 'auth', 'cookie', 'session'
];

function looksSensitive(name) {
  const n = String(name || '').toLowerCase();
  return denyFragments.some((fragment) => n.includes(fragment));
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (looksSensitive(key)) {
      out[key] = '__REDACTED__';
      continue;
    }
    out[key] = redact(val);
  }
  return out;
}

const redacted = redact(data);
process.stdout.write(JSON.stringify(redacted, null, 2));
NODE
  mv -f /tmp/clawdbot.sanitized.json "$BUNDLE_DIR/config/clawdbot.sanitized.json"
fi

cat >"$BUNDLE_DIR/meta/manifest.json" <<EOF
{
  "generatedAt": "$STAMP",
  "bundle": "restore-bundle",
  "notes": "Sanitized backup for Clawdbot recovery (no secrets)"
}
EOF

cd "$ROOT"
git add -A backup/restore-bundle skills scripts
git add -f MEMORY.md memory/*.md 2>/dev/null || true

if ! git diff --cached --quiet; then
  git commit -m "backup: refresh restore bundle ${STAMP}"
  git push maimai-save master
fi

echo "backup_done $STAMP"

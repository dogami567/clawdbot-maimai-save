# clawdbot-maimai-save

This repository is the recovery backup for my Clawdbot workspace.
Goal: if container data is lost, restore key memory, skills, scripts, and plugin assets quickly.

## What Gets Backed Up

- `MEMORY.md` and daily memory notes under `memory/` (excluding heavy chat/job raw logs)
- `skills/` (custom and imported skills)
- `scripts/` (automation and helper scripts)
- `.clawdbot/extensions/` (plugin source/config, excluding `node_modules`)
- Sanitized config snapshot: `backup/restore-bundle/config/clawdbot.sanitized.json`

## What Is Excluded / Redacted

- Raw secrets and tokens are not uploaded intentionally.
- Config snapshot is sanitized: secret-like keys are replaced with `__REDACTED__`.
- Runtime-only heavy logs are excluded from restore bundle by default.

## Automation

Backup script:
- `scripts/backup-restore-bundle.sh`

What it does:
1. Builds `backup/restore-bundle/`
2. Copies restore-critical files
3. Generates sanitized config snapshot
4. Commits and pushes to remote `maimai-save` when changed

Scheduled tasks:
- Daily backup push: `daily-backup-restore-bundle` (UTC 02:30)
- Weekly recovery drill check: `weekly-restore-drill-check` (UTC Sunday 03:00)

## Manual Run

```bash
cd /home/node/clawd
./scripts/backup-restore-bundle.sh
```

## Recovery Notes

If container data is lost:
1. Re-clone this repo into `/home/node/clawd`
2. Restore files from `backup/restore-bundle/`
3. Re-apply runtime secrets manually (do not expect secrets in repo)
4. Restart Clawdbot and verify channels/plugins

## Security

Treat this repo as sensitive operational backup.
Even without raw secrets, memory and config structure are private and should stay in private repos.

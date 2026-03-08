# TOOLS.md - Local Notes

Skills define *how* tools work. This file is for *your* specifics — the stuff that's unique to your setup.

## What Goes Here

Things like:
- Camera names and locations
- SSH hosts and aliases  
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

## Examples

```markdown
### Cameras
- living-room → Main area, 180° wide angle
- front-door → Entrance, motion-triggered

### SSH
- home-server → 192.168.1.100, user: admin

### TTS
- Preferred voice: "Nova" (warm, slightly British)
- Default speaker: Kitchen HomePod
```

## Why Separate?

Skills are shared. Your setup is yours. Keeping them apart means you can update skills without losing your notes, and share skills without leaking your infrastructure.

## GitHub

- `clawd-ai-kp` remote: `https://github.com/dogami567/clawd-ai-kp.git`
- Pushes may use a user-provided GitHub PAT at runtime.
- Do not store raw GitHub tokens in `MEMORY.md` or chatlog-style docs; prefer ephemeral use or environment-based secrets.

## QQ / OneBot

- 当前会话若是 QQ 私聊，目标格式：`channel=onebot` + `to=user:<当前QQ>`
- 当前会话若是 QQ 群聊，目标格式：`channel=onebot` + `to=group:<当前群号>`
- 用户本人私聊固定目标（仅在明确要求“发我 QQ 私聊”时使用）：`channel=onebot` + `to=user:281894872`
- 可靠主动提醒写法：cron `sessionTarget=isolated` + `payload.kind=agentTurn` + `deliver:true`
- 不要再用：`main + systemEvent + next-heartbeat` 做 QQ 主动提醒（会出现“任务显示成功但实际没及时送达”）
- 天气提醒内容要求：同一条消息里同时包含“提醒一句”+“实时天气结果”+“穿衣建议”

---

Add whatever helps you do your job. This is your cheat sheet.

# Log Schema

## Root

`memory/chatlog/`

## Daily Folder

`memory/chatlog/YYYY-MM-DD/`

## Channel Folder

`memory/chatlog/YYYY-MM-DD/<channel>/`

For OneBot normally use `onebot`.

## Conversation File

- Group: `group-<groupId>-<groupName>.md`
- DM: `dm-<userId>-<userName>.md`

If name unknown, use `unknown`.

## Markdown Header

```md
---
date: 2026-03-04
channel: onebot
chatType: group
groupId: 875336657
groupName: 技术群
sessionKey: agent:main:onebot:group:875336657
sessionId: 45adbe0b-36d6-454d-bda5-76141160688d
sessionFile: /home/node/.clawdbot/agents/main/sessions/45adbe0b-36d6-454d-bda5-76141160688d.jsonl
---
```

## Entry Format

```md
### 2026-03-04T05:28:00Z | role=user | eventId=63b50b8c | userId=281894872 | userName=dogami | messageId=1906563032
包报错暂时没有，我是想加新能力...

### 2026-03-04T05:28:10Z | role=assistant | eventId=87b3b8f7
对，你这个思路是对的...
```

Rules:
- Keep raw text only, no tool internals.
- Strip reply directive tags like `[[reply_to_current]]`.
- Skip synthetic system noise such as cron/status/exec completion text when it is not a real user utterance.
- Keep message order stable.
- Preserve original language.
- Separate entries by one blank line.

## Index (`index.jsonl`)

Append one JSON object per message:

```json
{"date":"2026-03-04","channel":"onebot","chatType":"group","groupId":"875336657","groupName":"技术群","sessionKey":"agent:main:onebot:group:875336657","sessionId":"45adbe0b-36d6-454d-bda5-76141160688d","sessionFile":"/home/node/.clawdbot/agents/main/sessions/45adbe0b-36d6-454d-bda5-76141160688d.jsonl","role":"user","eventId":"63b50b8c","userId":"281894872","userName":"dogami","messageId":"1906563032","time":"2026-03-04T05:28:00Z","file":"memory/chatlog/2026-03-04/onebot/group-875336657-技术群.md","text":"包报错暂时没有，我是想加新能力"}
```

Rules:
- Keep one-line compact JSON.
- Truncate `text` preview to ~240 chars.
- Escape newlines in preview.
- Use UTF-8.

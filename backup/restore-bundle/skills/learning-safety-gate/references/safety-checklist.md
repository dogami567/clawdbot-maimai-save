# Safety Checklist

## 1) Source Validation

- Confirm where the file/repo came from.
- Prefer official domains, verified publishers, signed releases.
- Flag URL shorteners, anonymous mirrors, and cracked content.

## 2) File Triage

- Compute hash (`sha256sum`) and keep for traceability.
- Check MIME type (`file --mime-type`) against extension.
- For scripts, preview header and obvious dangerous patterns.

## 3) Malware Scan

- Run ClamAV scan before opening/executing unknown content.
- Scan archive + extracted folder separately.
- Treat scanner errors as non-clean until retried.

## 4) Execution Controls

- Use sandbox/container/VM for first run.
- Disable network when not needed.
- Use least-privilege user context.

## 5) Decision Matrix

- `CLEAN` + low risk: proceed with learning.
- `CLEAN` + high risk: ask user before execution.
- `INFECTED`: block and quarantine.
- `UNVERIFIED`: no execution; ask user for next step.

## 6) Reporting Template

Use this exact shape:

```text
Gate Report
- Source: <url/path>
- Target: <path>
- Scan: <tool + command>
- Result: CLEAN | INFECTED | UNVERIFIED
- Decision: PROCEED | BLOCK | ASK
- Notes: <short rationale>
```

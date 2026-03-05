---
name: mewgenics-ai-lab
description: "Track and execute the Mewgenics AI module lifecycle: reverse-engineering evidence capture, breeding-model extraction, mod-state bookkeeping, and planning for realtime state capture, decision logic, and in-game automation. Use when working on Mewgenics .gon/.csv/.exe analysis, updating the module tracker, or deciding next implementation steps toward automated gameplay actions."
---

# Mewgenics AI Lab

## Overview

Maintain a single source of truth for this module and keep research-to-implementation work continuous.
Record every confirmed finding with evidence, keep unknowns explicit, and drive the next executable step.

## Core Workflow

1. Load `references/module-tracker.md`.
2. Read only the evidence files needed for the current question (for example `.tmp_data/*_clean.txt`, `.gon` patches, or dialog CSV lines).
3. Update tracker sections in-place:
- `Current Baseline Report`
- `Confirmed Findings`
- `Open Questions`
- `Execution Plan`
- `Session Log`
4. Keep every technical claim in one of three states:
- `Confirmed`: backed by direct evidence with file path and line.
- `Inferred`: likely, but not directly proven in current evidence.
- `Unknown`: required for next milestone but still unresolved.
5. Finish each update by writing the next concrete action batch with acceptance checks.

## Evidence Policy

- Reference exact files when possible.
- Prefer line-level citations for disassembly or data claims.
- Avoid replacing history with vague summaries; preserve key numbers, offsets, and constants.
- When uncertainty exists, write what is missing and how to fetch it.

## Milestone Model

Track work under these milestones and keep status current:

- M1: Data extraction and rule reconstruction (ongoing).
- M2: Realtime in-game state capture and normalization.
- M3: Decision layer (MCTS or optimization policy) based on extracted state.
- M4: In-game operation automation (next day, poop click, cat interaction actions).

## Output Contract

When this skill is used, always produce:

1. Updated tracker content in `references/module-tracker.md`.
2. A short "what changed this session" summary.
3. Explicit next-step checklist tied to the active milestone.

## Resources

### references/module-tracker.md
Use as the long-lived module ledger for background, findings, blockers, and plan.

### scripts/add_session_note.py
Use to append a structured session log entry quickly.

Example:

```bash
python scripts/add_session_note.py ^
  --title "Breeding formula extraction" ^
  --summary "Confirmed per-stat weighted inheritance selector" ^
  --done "Mapped call chain fcn.1401e47e0 -> fcn.1400d5880 -> fcn.1400a5ba0 -> fcn.1400a4920" ^
  --evidence ".tmp_data/fcn_1400a4920_clean.txt:23"
```

#!/usr/bin/env python3
"""Append a structured session note to references/module-tracker.md."""

from __future__ import annotations

import argparse
from datetime import datetime
from pathlib import Path


def _default_tracker_path() -> Path:
    skill_root = Path(__file__).resolve().parent.parent
    return skill_root / "references" / "module-tracker.md"


def _build_block(
    date_str: str,
    title: str,
    summary: str,
    done: list[str],
    issues: list[str],
    next_steps: list[str],
    evidence: list[str],
) -> str:
    lines: list[str] = []
    lines.append(f"### {date_str} - {title}")
    lines.append("Summary:")
    lines.append(f"- {summary}")

    if done:
        lines.append("")
        lines.append("Completed:")
        lines.extend(f"- {item}" for item in done)

    if issues:
        lines.append("")
        lines.append("Issues:")
        lines.extend(f"- {item}" for item in issues)

    if next_steps:
        lines.append("")
        lines.append("Next:")
        lines.extend(f"- {item}" for item in next_steps)

    if evidence:
        lines.append("")
        lines.append("Evidence:")
        lines.extend(f"- {item}" for item in evidence)

    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Append a structured session note to module-tracker.md."
    )
    parser.add_argument(
        "--tracker",
        type=Path,
        default=_default_tracker_path(),
        help="Path to tracker file (defaults to references/module-tracker.md).",
    )
    parser.add_argument("--date", default=datetime.now().strftime("%Y-%m-%d"))
    parser.add_argument("--title", required=True)
    parser.add_argument("--summary", required=True)
    parser.add_argument("--done", action="append", default=[])
    parser.add_argument("--issue", action="append", default=[])
    parser.add_argument("--next", dest="next_steps", action="append", default=[])
    parser.add_argument("--evidence", action="append", default=[])
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    tracker: Path = args.tracker
    if not tracker.exists():
        raise SystemExit(f"Tracker not found: {tracker}")

    block = _build_block(
        date_str=args.date,
        title=args.title.strip(),
        summary=args.summary.strip(),
        done=[x.strip() for x in args.done if x.strip()],
        issues=[x.strip() for x in args.issue if x.strip()],
        next_steps=[x.strip() for x in args.next_steps if x.strip()],
        evidence=[x.strip() for x in args.evidence if x.strip()],
    )

    if args.dry_run:
        print(block)
        return 0

    current = tracker.read_text(encoding="utf-8")
    if not current.endswith("\n"):
        current += "\n"
    tracker.write_text(current + "\n" + block, encoding="utf-8")
    print(f"Appended session note to: {tracker}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

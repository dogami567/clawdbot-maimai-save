#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GitHub Actions/Release 轮询工具（优先用于“不盯 UI 快速定位失败 step”）。

用法示例：
  python scripts/gh_actions.py runs --repo owner/repo
  python scripts/gh_actions.py jobs --repo owner/repo --run-id 123
  python scripts/gh_actions.py release-assets --repo owner/repo --tag v0.3.6

鉴权：
  - 公共仓库默认无需 token（注意 GitHub 无鉴权限速）
  - 如设置环境变量 GITHUB_TOKEN，将自动携带 Authorization 头
"""

from __future__ import annotations

import argparse
import datetime as _dt
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Dict, Iterable, List, Optional, Tuple


def _parse_iso(ts: Optional[str]) -> Optional[_dt.datetime]:
    if not ts:
        return None
    return _dt.datetime.fromisoformat(ts.replace("Z", "+00:00"))


def _duration_seconds(started_at: Optional[str], completed_at: Optional[str]) -> Optional[float]:
    s = _parse_iso(started_at)
    c = _parse_iso(completed_at)
    if not s or not c:
        return None
    return (c - s).total_seconds()


def _headers() -> Dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "codex-skill-gh-actions-release-troubleshooter",
    }
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def _get_json(url: str) -> Dict[str, Any]:
    req = urllib.request.Request(url, headers=_headers())
    try:
        with urllib.request.urlopen(req) as resp:
            return json.load(resp)  # type: ignore[no-any-return]
    except urllib.error.HTTPError as e:
        body = ""
        try:
            body = e.read().decode("utf-8", errors="replace")
        except Exception:
            pass
        raise RuntimeError(f"HTTP {e.code} {e.reason} for {url}\n{body}") from e


def _api_base(repo: str) -> str:
    if "/" not in repo:
        raise ValueError("--repo 必须是 owner/repo")
    owner, name = repo.split("/", 1)
    return f"https://api.github.com/repos/{owner}/{name}"


def cmd_runs(repo: str, per_page: int) -> int:
    url = f"{_api_base(repo)}/actions/runs?per_page={per_page}"
    data = _get_json(url)
    runs = data.get("workflow_runs", [])
    print(f"total_count={data.get('total_count')}")
    for r in runs:
        run_id = r.get("id")
        name = r.get("name")
        event = r.get("event")
        status = r.get("status")
        conclusion = r.get("conclusion")
        sha = (r.get("head_sha") or "")[:7]
        branch = r.get("head_branch")
        created_at = r.get("created_at")
        title = r.get("display_title")
        print(f"{run_id} {name} {event} {status} {conclusion} {sha} {branch} {created_at} {title}")
    return 0


def _print_jobs(jobs: List[Dict[str, Any]]) -> None:
    for j in jobs:
        print(f"job {j.get('name')} status={j.get('status')} conclusion={j.get('conclusion')}")
        steps = j.get("steps") or []
        for s in steps:
            num = s.get("number")
            name = s.get("name")
            status = s.get("status")
            conclusion = s.get("conclusion")
            dur = _duration_seconds(s.get("started_at"), s.get("completed_at"))
            dur_str = "" if dur is None else f"{dur:.0f}s"
            marker = ""
            if conclusion not in (None, "success"):
                marker = "FAIL "
            elif status == "in_progress":
                marker = "NOW  "
            print(f"  {marker}{num:>2} {name} status={status} conclusion={conclusion} dur={dur_str}")


def cmd_jobs(repo: str, run_id: int, per_page: int) -> int:
    url = f"{_api_base(repo)}/actions/runs/{run_id}/jobs?per_page={per_page}"
    data = _get_json(url)
    jobs = data.get("jobs", [])
    print(f"jobs={len(jobs)}")
    _print_jobs(jobs)
    return 0


def cmd_latest(repo: str, workflow: str, branch: Optional[str], per_page: int) -> int:
    url = f"{_api_base(repo)}/actions/runs?per_page={per_page}"
    data = _get_json(url)
    runs = data.get("workflow_runs", [])

    def match(r: Dict[str, Any]) -> bool:
        if (r.get("name") or "") != workflow:
            return False
        if branch and (r.get("head_branch") or "") != branch:
            return False
        return True

    selected = next((r for r in runs if match(r)), None)
    if not selected:
        print("未找到匹配的 run。请检查 --workflow / --branch，或用 `runs` 先看列表。", file=sys.stderr)
        return 2

    run_id = selected.get("id")
    print(f"run_id={run_id} status={selected.get('status')} conclusion={selected.get('conclusion')}")
    return cmd_jobs(repo=repo, run_id=int(run_id), per_page=100)


def cmd_release_assets(repo: str, tag: str) -> int:
    url = f"{_api_base(repo)}/releases/tags/{tag}"
    rel = _get_json(url)
    print(f"tag={rel.get('tag_name')} name={rel.get('name')} draft={rel.get('draft')} prerelease={rel.get('prerelease')}")
    assets = rel.get("assets", []) or []
    print(f"assets={len(assets)}")
    for a in assets:
        print(f"{a.get('name')} size={a.get('size')} state={a.get('state')}")
    return 0


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    p_runs = sub.add_parser("runs", help="列出最近 workflow runs")
    p_runs.add_argument("--repo", required=True, help="owner/repo")
    p_runs.add_argument("--per-page", type=int, default=10)

    p_jobs = sub.add_parser("jobs", help="查看某次 run 的 job/step 结果")
    p_jobs.add_argument("--repo", required=True, help="owner/repo")
    p_jobs.add_argument("--run-id", required=True, type=int)
    p_jobs.add_argument("--per-page", type=int, default=100)

    p_latest = sub.add_parser("latest", help="按 workflow/branch 选最近一次 run 并输出 jobs")
    p_latest.add_argument("--repo", required=True, help="owner/repo")
    p_latest.add_argument("--workflow", required=True, help="workflow 名称（Actions 里显示的 Name）")
    p_latest.add_argument("--branch", help="head_branch（tag 名也在这里）")
    p_latest.add_argument("--per-page", type=int, default=20)

    p_assets = sub.add_parser("release-assets", help="列出某个 tag 的 Release 附件")
    p_assets.add_argument("--repo", required=True, help="owner/repo")
    p_assets.add_argument("--tag", required=True)

    args = p.parse_args(argv)
    if args.cmd == "runs":
        return cmd_runs(repo=args.repo, per_page=args.per_page)
    if args.cmd == "jobs":
        return cmd_jobs(repo=args.repo, run_id=args.run_id, per_page=args.per_page)
    if args.cmd == "latest":
        return cmd_latest(repo=args.repo, workflow=args.workflow, branch=args.branch, per_page=args.per_page)
    if args.cmd == "release-assets":
        return cmd_release_assets(repo=args.repo, tag=args.tag)

    return 2


if __name__ == "__main__":
    raise SystemExit(main())

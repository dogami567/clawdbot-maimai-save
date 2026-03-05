#!/usr/bin/env python3
import argparse
import json
import os
import random
import sys
import time
import urllib.error
import urllib.parse
import urllib.request


def key_pool(*names: str) -> list[str]:
    values: list[str] = []
    for name in names:
        raw = (os.getenv(name) or "").strip()
        if not raw:
            continue
        parts = [p.strip() for p in raw.split(",") if p.strip()]
        values.extend(parts)
    dedup: list[str] = []
    seen = set()
    for item in values:
        if item in seen:
            continue
        seen.add(item)
        dedup.append(item)
    random.shuffle(dedup)
    return dedup


def http_json(url: str, body: dict, headers: dict, timeout: int = 20) -> dict:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url=url, data=data, method="POST")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "clawdbot-exa-router/1.0")
    req.add_header("Accept", "application/json")
    for k, v in headers.items():
        req.add_header(k, v)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
    return json.loads(raw)


def search_exa_search_api(query: str, num_results: int, text_chars: int, timeout: int, content_mode: str) -> dict:
    errors: list[str] = []
    keys = key_pool("EXA_API_KEYS", "EXA_API_KEY")
    if not keys:
        raise RuntimeError("No EXA_API_KEYS/EXA_API_KEY configured")

    contents = {"highlights": {"max_characters": text_chars}}
    if content_mode == "text":
        contents = {"text": {"max_characters": text_chars}}

    body = {
        "query": query,
        "type": "auto",
        "num_results": num_results,
        "contents": contents,
    }
    for key in keys:
        try:
            payload = http_json(
                url="https://api.exa.ai/search",
                body=body,
                headers={"x-api-key": key},
                timeout=timeout,
            )
            results = payload.get("results") or []
            return {
                "provider": "exa-search",
                "ok": True,
                "results": [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "text": ((r.get("text") or "")[:text_chars]) if content_mode == "text" else "",
                        "highlights": r.get("highlights") or [],
                    }
                    for r in results
                ],
            }
        except urllib.error.HTTPError as e:
            errors.append(f"exa-search HTTP {e.code}")
            continue
        except Exception as e:
            errors.append(f"exa-search {type(e).__name__}: {e}")
            continue

    return {"provider": "exa-search", "ok": False, "errors": errors}


def search_exa_chat_api(query: str, timeout: int) -> dict:
    errors: list[str] = []
    keys = key_pool("EXA_API_KEYS", "EXA_API_KEY")
    if not keys:
        raise RuntimeError("No EXA_API_KEYS/EXA_API_KEY configured")

    model = os.getenv("EXA_RESEARCH_MODEL", "exa-research")
    body = {
        "model": model,
        "messages": [{"role": "user", "content": query}],
        "stream": False,
    }

    for key in keys:
        try:
            payload = http_json(
                url="https://api.exa.ai/chat/completions",
                body=body,
                headers={"Authorization": f"Bearer {key}"},
                timeout=timeout,
            )
            content = (((payload.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
            return {
                "provider": "exa-chat",
                "ok": True,
                "results": [{"title": f"{model}", "url": "", "snippet": content}],
            }
        except urllib.error.HTTPError as e:
            errors.append(f"exa-chat HTTP {e.code}")
            continue
        except Exception as e:
            errors.append(f"exa-chat {type(e).__name__}: {e}")
            continue

    return {"provider": "exa-chat", "ok": False, "errors": errors}


def search_exa(
    query: str,
    num_results: int,
    text_chars: int,
    timeout: int,
    content_mode: str,
    exa_mode: str,
) -> dict:
    if exa_mode == "search":
        return search_exa_search_api(query, num_results, text_chars, timeout, content_mode)
    if exa_mode == "research":
        return search_exa_chat_api(query, timeout)

    first = search_exa_search_api(query, num_results, text_chars, timeout, content_mode)
    if first.get("ok"):
        return first
    second = search_exa_chat_api(query, timeout)
    if second.get("ok"):
        return second
    return {
        "provider": "exa",
        "ok": False,
        "errors": [*(first.get("errors") or []), *(second.get("errors") or [])],
    }


def search_brave(query: str, count: int, timeout: int) -> dict:
    errors: list[str] = []
    keys = key_pool("BRAVE_API_KEYS", "BRAVE_API_KEY")
    if not keys:
        return {"provider": "brave", "ok": False, "errors": ["No BRAVE_API_KEYS/BRAVE_API_KEY configured"]}

    for key in keys:
        try:
            qs = urllib.parse.urlencode({"q": query, "count": count})
            req = urllib.request.Request(
                url=f"https://api.search.brave.com/res/v1/web/search?{qs}", method="GET"
            )
            req.add_header("Accept", "application/json")
            req.add_header("X-Subscription-Token", key)
            with urllib.request.urlopen(req, timeout=timeout) as resp:
                raw = resp.read().decode("utf-8", errors="replace")
            payload = json.loads(raw)
            items = ((payload.get("web") or {}).get("results") or [])
            return {
                "provider": "brave",
                "ok": True,
                "results": [
                    {
                        "title": r.get("title", ""),
                        "url": r.get("url", ""),
                        "snippet": r.get("description", ""),
                    }
                    for r in items
                ],
            }
        except urllib.error.HTTPError as e:
            errors.append(f"brave HTTP {e.code}")
            continue
        except Exception as e:
            errors.append(f"brave {type(e).__name__}: {e}")
            continue

    return {"provider": "brave", "ok": False, "errors": errors}


def search_perplexity(query: str, timeout: int) -> dict:
    errors: list[str] = []
    keys = key_pool("PERPLEXITY_API_KEYS", "PERPLEXITY_API_KEY")
    if not keys:
        return {
            "provider": "perplexity",
            "ok": False,
            "errors": ["No PERPLEXITY_API_KEYS/PERPLEXITY_API_KEY configured"],
        }

    body = {
        "model": os.getenv("PERPLEXITY_MODEL", "sonar-pro"),
        "messages": [{"role": "user", "content": query}],
    }
    for key in keys:
        try:
            payload = http_json(
                url="https://api.perplexity.ai/chat/completions",
                body=body,
                headers={"Authorization": f"Bearer {key}"},
                timeout=timeout,
            )
            content = (((payload.get("choices") or [{}])[0].get("message") or {}).get("content") or "")
            return {
                "provider": "perplexity",
                "ok": True,
                "results": [{"title": "perplexity-answer", "url": "", "snippet": content}],
            }
        except urllib.error.HTTPError as e:
            errors.append(f"perplexity HTTP {e.code}")
            continue
        except Exception as e:
            errors.append(f"perplexity {type(e).__name__}: {e}")
            continue

    return {"provider": "perplexity", "ok": False, "errors": errors}


def main() -> int:
    parser = argparse.ArgumentParser(description="Multi-provider search with multi-key failover")
    parser.add_argument("query", help="search query")
    parser.add_argument("--providers", default="exa,brave,perplexity", help="comma list order")
    parser.add_argument("--num-results", type=int, default=5)
    parser.add_argument("--text-chars", type=int, default=4000)
    parser.add_argument("--timeout", type=int, default=20)
    parser.add_argument("--exa-content", choices=["highlights", "text"], default="highlights")
    parser.add_argument("--exa-mode", choices=["auto", "search", "research"], default="auto")
    args = parser.parse_args()

    providers = [p.strip().lower() for p in args.providers.split(",") if p.strip()]
    started = int(time.time())

    attempts = []
    for provider in providers:
        if provider == "exa":
            res = search_exa(
                args.query,
                args.num_results,
                args.text_chars,
                args.timeout,
                args.exa_content,
                args.exa_mode,
            )
        elif provider == "brave":
            res = search_brave(args.query, args.num_results, args.timeout)
        elif provider == "perplexity":
            res = search_perplexity(args.query, args.timeout)
        else:
            res = {"provider": provider, "ok": False, "errors": ["unsupported provider"]}

        attempts.append(res)
        if res.get("ok"):
            print(json.dumps({
                "ok": True,
                "provider": res.get("provider"),
                "query": args.query,
                "results": res.get("results", []),
                "attempts": [{"provider": x.get("provider"), "ok": x.get("ok")} for x in attempts],
                "ts": started,
            }, ensure_ascii=False))
            return 0

    print(json.dumps({"ok": False, "query": args.query, "attempts": attempts, "ts": started}, ensure_ascii=False))
    return 2


if __name__ == "__main__":
    sys.exit(main())

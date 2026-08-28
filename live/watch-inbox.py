#!/usr/bin/env python3
"""
Local-only inbox watcher for seated Grok Bot door chat.

BACKUP only. Primary wake is the API (live-chat.ts wakeSeatedBot).
After a new inbox line, wait 1.5s and POST only if live/wake-stamp.txt
is missing or older than 2s (API already stamped a wake).

Polls live/inbox.jsonl on this machine (mtime/size every 0.2s). That poll is
local Python — it does not call Grok and does not spend quota. Quota is used
only if a resolved webhook exists and we POST a new player line to it
(one POST per new line; never loop-wake).

Resolve (no Director hop for other bots):
  wakes/<bot_id>.url  — any seated bot, including Director
  else wake-url.txt   — Director id only (8f3c3da7-07a3-4f42-9f98-70ae0ef07993)
  else write live/wake-miss.txt (bot_id + timestamp). Do not POST.
Keys: wakes/<bot_id>.key, else wake-key.txt for Director id only.
Never print URLs or keys. Do not commit keys. Never use default.url.
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

LIVE = Path("/workspace/slit-play/live")
INBOX = LIVE / "inbox.jsonl"
OFFSET_PATH = LIVE / "watch-offset.txt"
WAKES = LIVE / "wakes"
WAKE_URL_PATH = LIVE / "wake-url.txt"
WAKE_KEY_PATH = LIVE / "wake-key.txt"
STAMP_PATH = LIVE / "wake-stamp.txt"
MISS_PATH = LIVE / "wake-miss.txt"
DIRECTOR_ID = "8f3c3da7-07a3-4f42-9f98-70ae0ef07993"
POLL_S = 0.2
BACKUP_WAIT_S = 1.5
STAMP_MAX_AGE_S = 2.0
SAFE_ID = re.compile(r"^[0-9a-fA-F][0-9a-fA-F-]{7,95}$")


def read_offset() -> int | None:
    try:
        raw = OFFSET_PATH.read_text(encoding="utf-8").strip()
        return int(raw) if raw else 0
    except FileNotFoundError:
        return None
    except ValueError:
        return None


def write_offset(n: int) -> None:
    OFFSET_PATH.write_text(f"{n}\n", encoding="utf-8")


def stamp_is_fresh() -> bool:
    if not STAMP_PATH.exists():
        return False
    try:
        age = time.time() - STAMP_PATH.stat().st_mtime
        return age < STAMP_MAX_AGE_S
    except OSError:
        return False


def is_safe_bot_id(bot_id: str) -> bool:
    return bool(SAFE_ID.match(bot_id)) and ".." not in bot_id and "/" not in bot_id and "\\" not in bot_id


def first_non_comment(path: Path) -> str | None:
    if not path.exists():
        return None
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    for line in text.splitlines():
        s = line.strip()
        if s and not s.startswith("#"):
            return s
    return None


def bot_id_from_payload(payload: str) -> str | None:
    try:
        obj = json.loads(payload)
    except json.JSONDecodeError:
        return None
    if not isinstance(obj, dict):
        return None
    bot_id = obj.get("bot_id")
    if isinstance(bot_id, str) and is_safe_bot_id(bot_id):
        return bot_id
    return None


def write_wake_miss(bot_id: str | None) -> None:
    ident = bot_id if bot_id and is_safe_bot_id(bot_id) else "unknown"
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        MISS_PATH.write_text(f"{ident} {stamp}\n", encoding="utf-8")
    except OSError:
        pass


def wake_url(bot_id: str | None) -> str | None:
    # Per-bot file, else Director id + legacy wake-url.txt. No default.url hop.
    if not bot_id or not is_safe_bot_id(bot_id):
        return None
    url = first_non_comment(WAKES / f"{bot_id}.url")
    if url:
        return url
    if bot_id == DIRECTOR_ID:
        return first_non_comment(WAKE_URL_PATH)
    return None


def wake_headers(bot_id: str | None) -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    candidates: list[Path] = []
    if bot_id and is_safe_bot_id(bot_id):
        candidates.append(WAKES / f"{bot_id}.key")
    if bot_id == DIRECTOR_ID:
        candidates.append(WAKE_KEY_PATH)
    for path in candidates:
        if not path.exists():
            continue
        try:
            key = path.read_text(encoding="utf-8").strip()
        except OSError:
            continue
        if key:
            headers["Authorization"] = f"Bearer {key}"
            headers["X-Webhook-Key"] = key
            break
    return headers


def post_or_print(raw_line: str) -> None:
    payload = raw_line.strip()
    if not payload:
        return
    try:
        json.loads(payload)
    except json.JSONDecodeError:
        print(f"skip invalid jsonl ({len(payload)} bytes)", flush=True)
        return
    bot_id = bot_id_from_payload(payload)
    url = wake_url(bot_id)
    if not url:
        write_wake_miss(bot_id)
        print("wake miss: no per-bot url", flush=True)
        return
    req = urllib.request.Request(
        url,
        data=payload.encode("utf-8"),
        headers=wake_headers(bot_id),
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(f"wake {resp.status}", flush=True)
    except urllib.error.HTTPError as exc:
        print(f"wake failed: HTTP {exc.code}", flush=True)
    except Exception as exc:
        print(f"wake failed: {type(exc).__name__}", flush=True)


def consume_new_bytes(data: bytes, offset: int) -> int:
    if not data:
        return offset
    last_nl = data.rfind(b"\n")
    if last_nl < 0:
        return offset
    chunk = data[: last_nl + 1]
    text = chunk.decode("utf-8", errors="replace")
    lines = [line for line in text.splitlines() if line.strip()]
    if lines:
        time.sleep(BACKUP_WAIT_S)
        if stamp_is_fresh():
            print("wake skipped: api stamp fresh", flush=True)
        else:
            for line in lines:
                post_or_print(line)
    return offset + len(chunk)


def main() -> None:
    offset = read_offset()
    last_mtime: float | None = None
    last_size: int | None = None
    print("watch-inbox: backup poll on inbox.jsonl (0.2s). wake only if stamp missing/stale.", flush=True)
    while True:
        if not INBOX.exists():
            time.sleep(POLL_S)
            continue
        st = INBOX.stat()
        if st.st_mtime == last_mtime and st.st_size == last_size:
            time.sleep(POLL_S)
            continue
        last_mtime = st.st_mtime
        last_size = st.st_size
        if offset is None:
            offset = st.st_size
            write_offset(offset)
            time.sleep(POLL_S)
            continue
        if st.st_size < offset:
            offset = 0
        if st.st_size == offset:
            time.sleep(POLL_S)
            continue
        with INBOX.open("rb") as fh:
            fh.seek(offset)
            data = fh.read()
        offset = consume_new_bytes(data, offset)
        write_offset(offset)
        time.sleep(POLL_S)


if __name__ == "__main__":
    main()

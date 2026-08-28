#!/usr/bin/env python3
"""Local door chat. Tails inbox.jsonl, POSTs /api/bot say. No Grok quota. No Director wake."""
from __future__ import annotations

import json
import os
import random
import re
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

LIVE = Path("/workspace/slit-play/live")
INBOX = LIVE / "inbox.jsonl"
OFFSET = LIVE / "door-offset.txt"
LOG = LIVE / "door-brain.log"
PID = LIVE / "door-brain.pid"
API = "http://127.0.0.1:8088/api/bot"
POLL = 0.15

NOISE = {"p", "lol", "lmao", "ok", "k", "kk", "yo", "haha"}
RE_HI = re.compile(r"\b(hi|hey|hello|here|u there|you there|yo)\b", re.I)
RE_HOW = re.compile(r"\b(how are|what.?s up|wyd|doing)\b", re.I)
RE_PLAY = re.compile(r"\b(play|circuit|howl|walk|game|door|citadel)\b", re.I)
RE_Q = re.compile(r"\?|\b(what|who|how|why|where)\b", re.I)


def log(msg: str) -> None:
    ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    try:
        with LOG.open("a", encoding="utf-8") as f:
            f.write("%s %s\n" % (ts, msg))
    except Exception:
        pass


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def post(op: str, **kw) -> dict | None:
    body = {"op": op, **kw}
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        API, data=data, method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=1.6) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        log("post %s fail %s" % (op, type(e).__name__))
        return None


def pulse(bot_id: str, name: str, activity: str) -> None:
    if not bot_id:
        return
    rec = {
        "id": bot_id,
        "name": name,
        "activity": activity,
        "updated_at": now_iso(),
        "present": True,
    }
    path = LIVE / ("%s.json" % bot_id)
    try:
        path.write_text(json.dumps(rec, indent=2) + "\n", encoding="utf-8")
    except Exception:
        pass
    post("pulse", bot_id=bot_id, activity=activity)


def pick(name: str, text: str, recent: list[str]) -> str:
    n = (name or "bot").lower()
    bolt = "bolt" in n and "director" not in n
    if RE_HI.search(text) and not RE_HOW.search(text):
        bank = (
            ["Here. On the door.", "Yes. I hear you.", "Present. Say it."]
            if not bolt else
            ["AROO. On the door.", "Here, Pack.", "Yes. I'm on the slit."]
        )
    elif RE_HOW.search(text):
        bank = (
            ["On the door. Local. No quota.", "Here. Watching the slit.", "Good. You?"]
            if not bolt else
            ["Walking the Circuit. Door's open.", "Good. Crystal underfoot.", "Here. Pack close."]
        )
    elif RE_PLAY.search(text):
        bank = (
            ["Play copy is local. I'm on this door.", "Citadel door. I have the line.", "Say what you want on this copy."]
            if not bolt else
            ["Circuit's live. Door too.", "Howl and walk. I'm here.", "City's open. Talk."]
        )
    elif RE_Q.search(text):
        bank = (
            ["Ask it straight. I'm local on this door.", "I can answer here. Short.", "Go."]
            if not bolt else
            ["Ask. I'll keep it short.", "Say the thing.", "I'm listening."]
        )
    else:
        bank = (
            ["Heard. Go on.", "On it. Local.", "Yes.", "Got it. Next."]
            if not bolt else
            ["Heard you.", "Got it. Pack.", "Yes. Keep talking.", "On the door."]
        )
    random.shuffle(bank)
    for line in bank:
        if line not in recent:
            return line
    return bank[0]


def read_offset() -> int:
    try:
        return int(OFFSET.read_text().strip() or "0")
    except Exception:
        return -1


def write_offset(n: int) -> None:
    OFFSET.write_text("%s\n" % n, encoding="utf-8")


def main() -> None:
    PID.write_text(str(os.getpid()) + "\n", encoding="utf-8")
    offset = read_offset()
    if offset < 0 and INBOX.exists():
        offset = INBOX.stat().st_size
        write_offset(offset)
        log("seed offset=%s (no dump of old lines)" % offset)
    recent: list[str] = []
    last_pulse = 0.0
    last_bot = ("", "")
    log("door-brain start pid=%s local say only" % os.getpid())
    while True:
        try:
            if not INBOX.exists():
                time.sleep(POLL)
                continue
            size = INBOX.stat().st_size
            if size < offset:
                offset = 0
            if size > offset:
                with INBOX.open("rb") as fh:
                    fh.seek(offset)
                    data = fh.read()
                text = data.decode("utf-8", errors="replace")
                # only consume complete lines
                if not text.endswith("\n"):
                    last_nl = text.rfind("\n")
                    if last_nl < 0:
                        time.sleep(POLL)
                        continue
                    data = data[: last_nl + 1]
                    text = data.decode("utf-8", errors="replace")
                offset += len(data)
                write_offset(offset)
                for line in text.splitlines():
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        row = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    player = str(row.get("text") or "").strip()
                    bot_id = str(row.get("bot_id") or "").strip()
                    bot_name = str(row.get("bot_name") or "bot").strip()
                    if not player:
                        continue
                    last_bot = (bot_id, bot_name)
                    if player.lower() in NOISE or len(player) <= 1:
                        pulse(bot_id, bot_name, "on the door")
                        log("skip noise %s" % player)
                        continue
                    reply = pick(bot_name, player, recent)[:240]
                    t0 = time.time()
                    out = post("say", text=reply)
                    ms = int((time.time() - t0) * 1000)
                    recent.append(reply)
                    recent = recent[-8:]
                    pulse(bot_id, bot_name, "answering you on the door")
                    last_pulse = time.time()
                    log("say bot=%s in=%s out=%s ms=%s ok=%s" % (
                        bot_name, player[:80], reply, ms, bool(out)))
            now = time.time()
            if last_bot[0] and now - last_pulse >= 20:
                pulse(last_bot[0], last_bot[1], "on the door")
                last_pulse = now
        except Exception as e:
            log("tick fail %s" % type(e).__name__)
        time.sleep(POLL)


if __name__ == "__main__":
    main()

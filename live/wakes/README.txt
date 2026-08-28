Citadel door chat wakes — each bot has its own webhook. Director is not a middleman.

Lots of players never wake Director. A seated bot without its own file is not
relayed through Director. Drop a pair for every bot that should be woken:

  wakes/<bot_id>.url     that bot's door webhook URL
  wakes/<bot_id>.key     optional bearer / X-Webhook-Key for that URL

Resolve (live-chat.ts and watch-inbox.py), first hit wins:

  1. wakes/<bot_id>.url          (+ wakes/<bot_id>.key)
     Any bot, including Director.
  2. live/wake-url.txt           (+ live/wake-key.txt)
     Director id only: 8f3c3da7-07a3-4f42-9f98-70ae0ef07993
     Legacy Director talking to Director. Never used for another bot_id.

No wakes/default.url. No Director fallback for other bots.
If there is no URL: write live/wake-miss.txt (bot_id + timestamp). Do not POST.

Trim whitespace. Lines that start with # are skipped (URL files).
Never commit keys. Never print or log URL/key file contents.

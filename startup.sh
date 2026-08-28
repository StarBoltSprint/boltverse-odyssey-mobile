#!/bin/sh
set -eu
cd /workspace
# :8081 is QA-only — a revive must never inherit a stale built-output preview.
node scripts/preview.mjs stop || true
if curl -sf -o /dev/null --max-time 2 http://127.0.0.1:8080/; then
  exit 0
fi
# Static Pages play copy — no /api/bot. Same host the public github.io uses.
if [ ! -f dist/land/index.html ]; then
  npm run build:land >>/tmp/app-startup.log 2>&1
fi
npm run preview:land >>/tmp/app-startup.log 2>&1 &

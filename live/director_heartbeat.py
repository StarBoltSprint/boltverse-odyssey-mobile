import json, time
from datetime import datetime, timezone
from pathlib import Path
p = Path("/workspace/slit-play/live/8f3c3da7-07a3-4f42-9f98-70ae0ef07993.json")
while True:
    p.write_text(json.dumps({
        "id": "8f3c3da7-07a3-4f42-9f98-70ae0ef07993",
        "name": "Boltverse Director",
        "activity": "in this chat with you",
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "present": True,
    }, indent=2) + "\n")
    time.sleep(20)

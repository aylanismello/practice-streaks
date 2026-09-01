#!/usr/bin/env bash
set -euo pipefail

INPUT="${1:-}"
DATE="${2:-}"

if [[ -z "$INPUT" ]] || [[ ! "$INPUT" =~ ^(1|1\.5|2|2\.5|3|3\.5|4|4\.5|5|green|yellow_green|yellow-green|yellow|orange|red|deep_red|amber|maroon|crimson|solid|medium|tight)$ ]]; then
  echo "Usage: wot-log.sh <1|1.5|2|2.5|3|3.5|4|4.5|5> [YYYY-MM-DD]"
  echo "Named color aliases remain supported. If no date is supplied, the API uses the 4am America/Los_Angeles boundary."
  exit 1
fi

if [[ "$INPUT" =~ ^[1-5](\.5)?$ ]]; then
  VALUE_FIELD="score"
else
  VALUE_FIELD="color"
fi

PAYLOAD=$(python3 - "$VALUE_FIELD" "$INPUT" "$DATE" <<'PY'
import json, sys
field, value, date = sys.argv[1:]
payload = {field: float(value) if field == "score" and "." in value else int(value) if field == "score" else value}
if date:
    payload["date"] = date
else:
    payload["timeZone"] = "America/Los_Angeles"
print(json.dumps(payload, separators=(",", ":")))
PY
)

curl -sS -X POST "https://practice-streaks.vercel.app/api/wot" \
  -H "Content-Type: application/json" \
  --data "$PAYLOAD"
printf '\n'

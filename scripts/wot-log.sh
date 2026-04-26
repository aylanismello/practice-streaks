#!/usr/bin/env bash
set -euo pipefail

SUPABASE_URL="https://zifjbbhgeydgccjolmji.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppZmpiYmhnZXlkZ2Njam9sbWppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4Mzg2MCwiZXhwIjoyMDg4OTU5ODYwfQ.QMbSJDP3cqEfzYNPRaM1uCcE7pHcJJWM99FuNPPEf7c"

INPUT="${1:-}"
DATE="${2:-}"

if [[ -z "$INPUT" ]] || [[ ! "$INPUT" =~ ^(1|2|3|4|5|green|yellow_green|yellow-green|yellow|orange|red|deep_red|amber|maroon|crimson|solid|medium|tight)$ ]]; then
  echo "Usage: wot-log.sh <1|2|3|4|5> [YYYY-MM-DD]"
  echo "Aliases: red/deep_red→1, orange/tight/amber→2, yellow/medium→3, yellow_green/solid→4, green→5. If no date, uses today with 4am PT day boundary."
  exit 1
fi

case "$INPUT" in
  1|red|maroon|crimson|deep_red) SCORE=1; COLOR="red" ;;
  2|orange|tight|amber) SCORE=2; COLOR="orange" ;;
  3|yellow|medium) SCORE=3; COLOR="yellow" ;;
  4|yellow_green|yellow-green|solid) SCORE=4; COLOR="yellow_green" ;;
  5|green) SCORE=5; COLOR="green" ;;
esac

if [[ -z "$DATE" ]]; then
  HOUR_PT=$(TZ="America/Los_Angeles" date +%H)
  if [ "$HOUR_PT" -lt 4 ]; then
    DATE=$(TZ="America/Los_Angeles" date -v-1d +%Y-%m-%d 2>/dev/null || TZ="America/Los_Angeles" date -d "yesterday" +%Y-%m-%d)
  else
    DATE=$(TZ="America/Los_Angeles" date +%Y-%m-%d)
  fi
fi

echo "Logging WOT: $SCORE ($COLOR) for $DATE"

curl -s -X POST "${SUPABASE_URL}/rest/v1/wot_log" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "{\"date\": \"${DATE}\", \"score\": ${SCORE}, \"color\": \"${COLOR}\"}"

echo ""
echo "Done."

#!/usr/bin/env bash
set -euo pipefail

SUPABASE_URL="https://zifjbbhgeydgccjolmji.supabase.co"
SUPABASE_SERVICE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InppZmpiYmhnZXlkZ2Njam9sbWppIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzM4Mzg2MCwiZXhwIjoyMDg4OTU5ODYwfQ.QMbSJDP3cqEfzYNPRaM1uCcE7pHcJJWM99FuNPPEf7c"

COLOR="${1:-}"
DATE="${2:-}"

if [[ -z "$COLOR" ]] || [[ ! "$COLOR" =~ ^(green|yellow_green|yellow|orange|red|deep_red|amber|maroon|crimson|solid|medium|tight)$ ]]; then
  echo "Usage: wot-log.sh <green|yellow_green|yellow|orange|red> [YYYY-MM-DD]"
  echo "Aliases: solid/yellow-green→yellow_green, medium→yellow, tight/amber→orange, maroon/crimson/deep_red→red. If no date, uses today with 4am PT day boundary."
  exit 1
fi

case "$COLOR" in
  solid|yellow-green) COLOR="yellow_green" ;;
  medium) COLOR="yellow" ;;
  tight|amber) COLOR="orange" ;;
  maroon|crimson|deep_red) COLOR="red" ;;
esac

if [[ -z "$DATE" ]]; then
  HOUR_PT=$(TZ="America/Los_Angeles" date +%H)
  if [ "$HOUR_PT" -lt 4 ]; then
    DATE=$(TZ="America/Los_Angeles" date -v-1d +%Y-%m-%d 2>/dev/null || TZ="America/Los_Angeles" date -d "yesterday" +%Y-%m-%d)
  else
    DATE=$(TZ="America/Los_Angeles" date +%Y-%m-%d)
  fi
fi

echo "Logging WOT: $COLOR for $DATE"

curl -s -X POST "${SUPABASE_URL}/rest/v1/wot_log" \
  -H "apikey: ${SUPABASE_SERVICE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_SERVICE_KEY}" \
  -H "Content-Type: application/json" \
  -H "Prefer: resolution=merge-duplicates" \
  -d "{\"date\": \"${DATE}\", \"color\": \"${COLOR}\"}"

echo ""
echo "Done."

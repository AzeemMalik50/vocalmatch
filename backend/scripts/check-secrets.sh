#!/usr/bin/env bash
# Sanity check that no real secret values are baked into source.
# Returns nonzero if any match is found.
set -euo pipefail

PATTERN='(JWT_SECRET|api_secret|API_KEY|API_SECRET|PASSWORD|SECRET)[[:space:]]*[:=][[:space:]]*['"'"'"][^'"'"'"]{8,}['"'"'"]'

if grep -rEn "$PATTERN" backend/src \
     --exclude="*.spec.ts" \
     --exclude="seed-*.ts" \
     2>/dev/null; then
  echo "❌ Possible secret literal found in backend/src — move to .env"
  exit 1
fi

echo "✅ No literal-looking secrets in backend/src"

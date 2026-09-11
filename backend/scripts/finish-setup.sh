#!/usr/bin/env bash
#
# Everything that has to happen after the Worker has a public URL.
#
# Cloudflare needs a workers.dev subdomain registered on the account before a Worker can be
# reached, and that is a one-time choice made in the dashboard. Once it exists, run:
#
#   ./scripts/finish-setup.sh https://herdcare-backend.<your-subdomain>.workers.dev 0712345678
#
# It points the Worker at itself, checks it is alive, creates a farm for that number, and prints
# the code to type into the app. Safe to run more than once.

set -euo pipefail

BASE_URL="${1:-}"
PHONE="${2:-}"

if [ -z "$BASE_URL" ] || [ -z "$PHONE" ]; then
  echo "Usage: $0 <worker-url> <your-mpesa-number>" >&2
  echo "  e.g. $0 https://herdcare-backend.kelly.workers.dev 0712345678" >&2
  exit 1
fi

BASE_URL="${BASE_URL%/}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

if [ ! -f .dev.vars ]; then
  echo "No .dev.vars found. It holds the ADMIN_TOKEN this script needs." >&2
  exit 1
fi

ADMIN_TOKEN="$(grep '^ADMIN_TOKEN=' .dev.vars | cut -d= -f2-)"
if [ -z "$ADMIN_TOKEN" ]; then
  echo "ADMIN_TOKEN is missing from .dev.vars." >&2
  exit 1
fi

echo "==> Telling the Worker its own address"
# It needs this to build the M-Pesa callback URL it hands to Safaricom.
printf '%s' "$BASE_URL" | npx wrangler secret put PUBLIC_BASE_URL >/dev/null 2>&1
echo "    PUBLIC_BASE_URL = $BASE_URL"

echo
echo "==> Checking the Worker is alive"
HEALTH="$(curl -fsS "$BASE_URL/health")" || {
  echo "    Could not reach $BASE_URL/health" >&2
  echo "    Check the subdomain is registered and the Worker deployed." >&2
  exit 1
}
echo "    $HEALTH"

echo
echo "==> Creating a farm for $PHONE"
# The owner plan so the test account never lapses and never earns anybody commission.
ACTIVATE="$(curl -fsS -X POST "$BASE_URL/activate" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\",\"name\":\"My farm\",\"plan\":\"owner\"}")"
echo "    $(printf '%s' "$ACTIVATE" | head -c 200)..."

echo
echo "==> Issuing a sign-in code"
# Agent-issued rather than SMS, because no SMS provider is configured.
RECOVER="$(curl -fsS -X POST "$BASE_URL/admin/recover" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\"}")"

CODE="$(printf '%s' "$RECOVER" | sed -n 's/.*"code"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')"

echo
echo "==> Pointing the app at this Worker"
printf 'EXPO_PUBLIC_API_URL=%s\n' "$BASE_URL" > ../frontend/.env
echo "    wrote frontend/.env"

cat <<EOF

────────────────────────────────────────────────────────────────
  Ready. Your sign-in code is:  ${CODE:-see the response above}

  It lasts 30 minutes. To test the sync:

  1. Rebuild the app. EXPO_PUBLIC_API_URL is compiled into the
     bundle, so a running app will not pick it up:

       cd ../frontend && npx expo start --clear

  2. In the app: Settings, then Online backup, then link the phone.
     Enter $PHONE and the code above.

  3. Add an animal or two, then Settings, then Back up now.

  4. Check it landed:

       cd backend
       npx wrangler d1 execute herdcare --remote \\
         --command "SELECT phone, size_bytes, record_count, updated_at \\
                    FROM backups JOIN farms ON farms.id = backups.farm_id"
────────────────────────────────────────────────────────────────
EOF

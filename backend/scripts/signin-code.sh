#!/usr/bin/env bash
#
# Issues a sign-in code for a farmer's phone, for linking online backup.
#
#   ./scripts/signin-code.sh 0705275707
#
# Must be run from the backend folder, because that is where .dev.vars lives. It holds the admin
# token, and is git-ignored.

set -euo pipefail

PHONE="${1:-}"
if [ -z "$PHONE" ]; then
  echo "Usage: $0 <mpesa-number>" >&2
  echo "  e.g. $0 0705275707" >&2
  exit 1
fi

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

if [ ! -f .dev.vars ]; then
  echo "No .dev.vars in $HERE" >&2
  echo "It holds ADMIN_TOKEN. If it is gone, set a new one with:" >&2
  echo "  openssl rand -base64 32 | tee >(cat >/dev/stderr) | npx wrangler secret put ADMIN_TOKEN" >&2
  exit 1
fi

ADMIN_TOKEN="$(grep '^ADMIN_TOKEN=' .dev.vars | cut -d= -f2-)"
BASE_URL="$(grep '^PUBLIC_BASE_URL=' .dev.vars 2>/dev/null | cut -d= -f2- || true)"
BASE_URL="${BASE_URL:-https://herdcare-backend.kellykoome20.workers.dev}"

RESPONSE="$(curl -fsS -X POST "${BASE_URL%/}/admin/recover" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$PHONE\"}")" || {
  echo "Request failed. Is the Worker deployed, and is ADMIN_TOKEN current?" >&2
  exit 1
}

printf '%s' "$RESPONSE" | python3 -c '
import json, sys
d = json.load(sys.stdin)
if "code" not in d:
    print(d.get("error", d)); raise SystemExit(1)
print()
print("  Sign-in code:", d["code"])
print("  Valid for:   ", d["expiresInMinutes"], "minutes")
print("  Farm:        ", d["farm"]["name"] or d["farm"]["phone"])
print()
print("  In the app: Settings > Online backup > link this phone")
print()
'

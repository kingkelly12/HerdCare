#!/usr/bin/env bash
#
# Switches on in-app M-Pesa payment, once you have a paybill or till and Daraja credentials.
#
#   ./scripts/connect-daraja.sh
#
# Nothing in the app needs rebuilding. The app asks the server whether payments are on, so the Pay
# buttons appear on every farmer's phone the moment this finishes, and disappear again if you ever
# remove the credentials.
#
# Where each value comes from, at https://developer.safaricom.co.ke :
#   Consumer key / secret   My Apps, then your app
#   Shortcode               Your paybill or till number
#   Passkey                 Emailed by Safaricom when Lipa na M-Pesa Online is approved.
#                           For sandbox testing it is published on the Daraja portal.

set -euo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

BASE="$(grep '^PUBLIC_BASE_URL=' .dev.vars 2>/dev/null | cut -d= -f2- || true)"
BASE="${BASE%/}"
CB_SECRET="$(grep '^MPESA_CALLBACK_SECRET=' .dev.vars 2>/dev/null | cut -d= -f2- || true)"

if [ -z "$BASE" ] || [ -z "$CB_SECRET" ]; then
  echo "PUBLIC_BASE_URL or MPESA_CALLBACK_SECRET is missing from .dev.vars." >&2
  exit 1
fi

put_secret() {
  # Piped, so the value is never echoed to the terminal or left in shell history.
  printf '%s' "$2" | npx wrangler secret put "$1" >/dev/null 2>&1
  echo "    set $1"
}

echo
echo "  Connecting HerdCare to Safaricom Daraja"
echo "  Values are hidden as you type and never written to disk."
echo

read -rp  "  Environment [sandbox/production] (sandbox): " ENVIRONMENT
ENVIRONMENT="${ENVIRONMENT:-sandbox}"
if [ "$ENVIRONMENT" != "sandbox" ] && [ "$ENVIRONMENT" != "production" ]; then
  echo "  Must be sandbox or production." >&2; exit 1
fi

read -rp  "  Shortcode (paybill or till number): " SHORTCODE
read -rp  "  Is that a paybill or a till? [paybill/till] (paybill): " SHORTCODE_TYPE
SHORTCODE_TYPE="${SHORTCODE_TYPE:-paybill}"
if [ "$SHORTCODE_TYPE" != "paybill" ] && [ "$SHORTCODE_TYPE" != "till" ]; then
  echo "  Must be paybill or till." >&2; exit 1
fi

read -rsp "  Consumer key: " CONSUMER_KEY;       echo
read -rsp "  Consumer secret: " CONSUMER_SECRET; echo
read -rsp "  Passkey: " PASSKEY;                 echo

for pair in "shortcode:$SHORTCODE" "consumer key:$CONSUMER_KEY" "consumer secret:$CONSUMER_SECRET" "passkey:$PASSKEY"; do
  if [ -z "${pair#*:}" ]; then echo "  The ${pair%%:*} cannot be empty." >&2; exit 1; fi
done

echo
echo "==> Storing credentials as Worker secrets"
put_secret MPESA_ENVIRONMENT     "$ENVIRONMENT"
put_secret MPESA_SHORTCODE       "$SHORTCODE"
put_secret MPESA_SHORTCODE_TYPE  "$SHORTCODE_TYPE"
put_secret MPESA_CONSUMER_KEY    "$CONSUMER_KEY"
put_secret MPESA_CONSUMER_SECRET "$CONSUMER_SECRET"
put_secret MPESA_PASSKEY         "$PASSKEY"

echo
echo "==> Checking the server now reports payments as on"
# Secrets take a few seconds to reach every Cloudflare location.
for attempt in 1 2 3 4 5 6; do
  if curl -fsS "$BASE/health" | grep -q '"payments":true'; then
    ON=1; break
  fi
  sleep 5
done

if [ "${ON:-0}" != "1" ]; then
  echo "    The server still reports payments off. Check each value and run this again." >&2
  exit 1
fi
echo "    payments: on"

cat <<EOF

────────────────────────────────────────────────────────────────
  Payments are switched on.

  The Pay buttons now appear in the app on every phone, with no
  rebuild. One step left, in the Daraja portal:

  Register this as your callback URL:

    $BASE/pay/callback/$CB_SECRET

  Keep that URL private. The secret on the end is part of what
  stops somebody faking a payment.

  Then test with a real STK push. In sandbox, pay from the test
  number 254708374149. Amounts are reversed by Safaricom within
  48 hours.

  To confirm the whole path afterwards:
    ./scripts/verify-live.sh
────────────────────────────────────────────────────────────────
EOF

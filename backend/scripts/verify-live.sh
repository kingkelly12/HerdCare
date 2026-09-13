#!/usr/bin/env bash
#
# End-to-end check of the live Worker: security, sync, and the M-Pesa callback path.
#
#   ./scripts/verify-live.sh
#
# Uses throwaway phone numbers and deletes every row it creates, even if a check fails part way.
# It never touches a real farm. Payments are tested by posting a genuine-shaped Daraja callback,
# since a real STK push needs Daraja credentials you do not have yet — this proves everything from
# "Safaricom says it was paid" onwards, which is all the code that is yours.

set -uo pipefail

HERE="$(cd "$(dirname "$0")/.." && pwd)"
cd "$HERE"

ADMIN="$(grep '^ADMIN_TOKEN=' .dev.vars | cut -d= -f2-)"
CB_SECRET="$(grep '^MPESA_CALLBACK_SECRET=' .dev.vars | cut -d= -f2-)"
BASE="$(grep '^PUBLIC_BASE_URL=' .dev.vars | cut -d= -f2-)"
BASE="${BASE%/}"

# Distinctive numbers nobody real will ever have, so cleanup cannot catch a real farm.
FARM_PHONE="254799000111"
OTHER_FARM_PHONE="254799000333"
AGENT_PHONE="254799000222"
CHECKOUT="ws_CO_HERDCARE_TEST_$RANDOM$RANDOM"

PASS=0
FAIL=0
ok()   { echo "  ok    $1"; PASS=$((PASS+1)); }
bad()  { echo "  FAIL  $1"; FAIL=$((FAIL+1)); }
check() { if eval "$2"; then ok "$1"; else bad "$1"; fi; }

d1() { npx wrangler d1 execute herdcare --remote --json --command "$1" 2>/dev/null; }
d1val() { d1 "$1" | python3 -c 'import json,sys
try:
  r=json.load(sys.stdin)[0]["results"]; print(list(r[0].values())[0] if r else "")
except Exception: print("")'; }
jget() { python3 -c "import json,sys
try: print(json.load(sys.stdin)$1)
except Exception: print('')"; }

cleanup() {
  echo
  echo "==> Cleaning up test data"
  for phone in "$FARM_PHONE" "$OTHER_FARM_PHONE"; do
    d1 "DELETE FROM payments WHERE farm_id IN (SELECT id FROM farms WHERE phone='$phone')" >/dev/null
    d1 "DELETE FROM issued_licenses WHERE farm_id IN (SELECT id FROM farms WHERE phone='$phone')" >/dev/null
    d1 "DELETE FROM backups WHERE farm_id IN (SELECT id FROM farms WHERE phone='$phone')" >/dev/null
    d1 "DELETE FROM devices WHERE farm_id IN (SELECT id FROM farms WHERE phone='$phone')" >/dev/null
    d1 "DELETE FROM recovery_log WHERE phone='$phone'" >/dev/null
    d1 "DELETE FROM notices WHERE farm_id IN (SELECT id FROM farms WHERE phone='$phone')" >/dev/null
    d1 "DELETE FROM otp_codes WHERE phone='$phone'" >/dev/null
    d1 "DELETE FROM pending_payments WHERE phone='$phone'" >/dev/null
    d1 "DELETE FROM farms WHERE phone='$phone'" >/dev/null
  done
  d1 "DELETE FROM agents WHERE phone='$AGENT_PHONE'" >/dev/null
  left="$(d1val "SELECT (SELECT COUNT(*) FROM farms WHERE phone IN ('$FARM_PHONE','$OTHER_FARM_PHONE')) + (SELECT COUNT(*) FROM agents WHERE phone='$AGENT_PHONE') + (SELECT COUNT(*) FROM pending_payments WHERE phone IN ('$FARM_PHONE','$OTHER_FARM_PHONE'))")"
  echo "    test rows remaining: ${left:-0}"
  echo
  echo "────────────────────────────────"
  echo "  $PASS passed, $FAIL failed"
  echo "────────────────────────────────"
}
trap cleanup EXIT

echo "==> Worker"
HEALTH="$(curl -fsS "$BASE/health")"
check "health responds" '[ "$(echo "$HEALTH" | jget "[\"ok\"]")" = "True" ]'

echo
echo "==> Security"
REG1="$(curl -sS -X POST "$BASE/agents/register" -H 'Content-Type: application/json' -d "{\"name\":\"Test Agent\",\"phone\":\"$AGENT_PHONE\"}")"
AGENT_KEY="$(echo "$REG1" | jget '["apiKey"]')"
AGENT_CODE="$(echo "$REG1" | jget '["agent"]["code"]')"
check "a new agent can register and gets a key" '[ -n "$AGENT_KEY" ]'

REG2_STATUS="$(curl -s -o /tmp/reg2.json -w '%{http_code}' -X POST "$BASE/agents/register" -H 'Content-Type: application/json' -d "{\"name\":\"Attacker\",\"phone\":\"$AGENT_PHONE\"}")"
REG2_KEY="$(jget '["apiKey"]' < /tmp/reg2.json)"
check "re-registering a known number is refused (409)" '[ "$REG2_STATUS" = "409" ]'
check "and hands out no key to take the account over" '[ -z "$REG2_KEY" ]'

# A farm belonging to nobody, so it is not this agent's.
curl -fsS -X POST "$BASE/activate" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$OTHER_FARM_PHONE\",\"name\":\"Not yours\",\"plan\":\"trial\"}" >/dev/null
STEAL_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/admin/recover" -H "Authorization: Bearer $AGENT_KEY" -H 'Content-Type: application/json' -d "{\"phone\":\"$OTHER_FARM_PHONE\"}")"
check "an agent cannot issue a code for a farm that is not theirs" '[ "$STEAL_STATUS" = "404" ]'

echo
echo "==> Sync: sign in, back up, restore"
curl -fsS -X POST "$BASE/activate" -H "Authorization: Bearer $ADMIN" -H 'Content-Type: application/json' \
  -d "{\"phone\":\"$FARM_PHONE\",\"name\":\"Test Farm\",\"plan\":\"trial\",\"agent\":\"$AGENT_CODE\"}" >/dev/null

OWN_CODE="$(curl -sS -X POST "$BASE/admin/recover" -H "Authorization: Bearer $AGENT_KEY" -H 'Content-Type: application/json' -d "{\"phone\":\"$FARM_PHONE\"}" | jget '["code"]')"
check "an agent CAN issue a code for their own farm" '[ -n "$OWN_CODE" ]'

VERIFY="$(curl -sS -X POST "$BASE/auth/verify" -H 'Content-Type: application/json' -d "{\"phone\":\"$FARM_PHONE\",\"code\":\"$OWN_CODE\"}")"
DEVICE="$(echo "$VERIFY" | jget '["deviceToken"]')"
check "the code signs the phone in" '[ -n "$DEVICE" ]'
check "and returns the licence in the same call" '[ -n "$(echo "$VERIFY" | jget "[\"token\"]")" ]'

BUNDLE='{"format":"herdcare-backup","version":1,"data":{"animals":[{"id":"t1","tagNumber":"TEST-001"},{"id":"t2","tagNumber":"TEST-002"}]}}'
PUT="$(curl -sS -X PUT "$BASE/backup" -H "Authorization: Bearer $DEVICE" -H 'Content-Type: application/json' \
  -d "$(python3 -c "import json,sys; print(json.dumps({'data': sys.argv[1], 'records': 2}))" "$BUNDLE")")"
check "a backup uploads" '[ "$(echo "$PUT" | jget "[\"saved\"]")" = "True" ]'

GOT="$(curl -sS "$BASE/backup" -H "Authorization: Bearer $DEVICE" | jget '["data"]')"
check "and comes back byte for byte" '[ "$GOT" = "$BUNDLE" ]'
check "the backup row really is in D1" '[ "$(d1val "SELECT record_count FROM backups WHERE farm_id=(SELECT id FROM farms WHERE phone='"'"'$FARM_PHONE'"'"')")" = "2" ]'

STRANGER="$(curl -s -o /dev/null -w '%{http_code}' "$BASE/backup" -H 'Authorization: Bearer not-a-real-device-token')"
check "a stranger's token cannot read it" '[ "$STRANGER" = "401" ]'

echo
echo "==> Payments: the Daraja callback path"
FARM_ID="$(d1val "SELECT id FROM farms WHERE phone='$FARM_PHONE'")"
BEFORE="$(d1val "SELECT expires_at FROM farms WHERE phone='$FARM_PHONE'")"

# Exactly the row /pay writes after a successful STK push.
d1 "INSERT INTO pending_payments (id, checkout_request_id, merchant_request_id, farm_id, phone, plan, amount) VALUES ('test-$CHECKOUT', '$CHECKOUT', 'm-test', '$FARM_ID', '$FARM_PHONE', 'quarterly', 2800)" >/dev/null

callback() {
  curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/pay/callback/$1" -H 'Content-Type: application/json' -d "{
    \"Body\":{\"stkCallback\":{\"MerchantRequestID\":\"m-test\",\"CheckoutRequestID\":\"$CHECKOUT\",
    \"ResultCode\":0,\"ResultDesc\":\"The service request is processed successfully.\",
    \"CallbackMetadata\":{\"Item\":[{\"Name\":\"Amount\",\"Value\":$2},{\"Name\":\"MpesaReceiptNumber\",\"Value\":\"$3\"},{\"Name\":\"PhoneNumber\",\"Value\":$FARM_PHONE}]}}}}"
}

callback "wrong-secret" 2800 "TESTRCPT001" >/dev/null
check "a callback with the wrong secret changes nothing" '[ "$(d1val "SELECT status FROM pending_payments WHERE checkout_request_id='"'"'$CHECKOUT'"'"'")" = "pending" ]'

callback "$CB_SECRET" 2800 "TESTRCPT001" >/dev/null
check "a genuine callback marks the payment paid" '[ "$(d1val "SELECT status FROM pending_payments WHERE checkout_request_id='"'"'$CHECKOUT'"'"'")" = "paid" ]'

AFTER="$(d1val "SELECT expires_at FROM farms WHERE phone='$FARM_PHONE'")"
check "and extends the subscription ($BEFORE -> $AFTER)" '[ "$AFTER" \> "$BEFORE" ]'
check "the farm is now on the plan it paid for" '[ "$(d1val "SELECT plan FROM farms WHERE phone='"'"'$FARM_PHONE'"'"'")" = "quarterly" ]'
check "the payment is recorded with its receipt" '[ "$(d1val "SELECT COUNT(*) FROM payments WHERE mpesa_ref='"'"'TESTRCPT001'"'"'")" = "1" ]'
check "the agent earned 10% commission (280)" '[ "$(d1val "SELECT commission FROM payments WHERE mpesa_ref='"'"'TESTRCPT001'"'"'")" = "280" ]'
check "and the 750 bounty on a first quarterly payment" '[ "$(d1val "SELECT bounty FROM payments WHERE mpesa_ref='"'"'TESTRCPT001'"'"'")" = "750" ]'

callback "$CB_SECRET" 2800 "TESTRCPT001" >/dev/null
check "Safaricom retrying the same callback does not pay twice" '[ "$(d1val "SELECT COUNT(*) FROM payments WHERE mpesa_ref='"'"'TESTRCPT001'"'"'")" = "1" ]'
check "nor extend the subscription twice" '[ "$(d1val "SELECT expires_at FROM farms WHERE phone='"'"'$FARM_PHONE'"'"'")" = "$AFTER" ]'
check "and leaves the payment marked paid, not rejected" '[ "$(d1val "SELECT status FROM pending_payments WHERE checkout_request_id='"'"'$CHECKOUT'"'"'")" = "paid" ]'

POLL="$(curl -sS "$BASE/pay/$CHECKOUT")"
check "the app's poll sees the payment as paid" '[ "$(echo "$POLL" | jget "[\"status\"]")" = "paid" ]'
check "and receives the new activation code" '[ -n "$(echo "$POLL" | jget "[\"token\"]")" ]'

# A forged success for a short amount, against a fresh pending row.
FORGED="ws_CO_HERDCARE_FORGED_$RANDOM"
d1 "INSERT INTO pending_payments (id, checkout_request_id, merchant_request_id, farm_id, phone, plan, amount) VALUES ('forged-$FORGED', '$FORGED', 'm-f', '$FARM_ID', '$FARM_PHONE', 'annual', 10000)" >/dev/null
CHECKOUT="$FORGED" callback "$CB_SECRET" 1 "TESTFORGED01" >/dev/null
check "a callback claiming 1 shilling bought a year is refused" '[ "$(d1val "SELECT status FROM pending_payments WHERE checkout_request_id='"'"'$FORGED'"'"'")" != "paid" ]'
check "and grants no payment" '[ "$(d1val "SELECT COUNT(*) FROM payments WHERE mpesa_ref='"'"'TESTFORGED01'"'"'")" = "0" ]'

echo
echo "==> Payments are correctly off until Daraja is configured"
PAY_STATUS="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/pay" -H 'Content-Type: application/json' -d "{\"phone\":\"$FARM_PHONE\",\"plan\":\"quarterly\"}")"
check "starting a payment returns 503, not a broken push" '[ "$PAY_STATUS" = "503" ]'
check "and /health reports payments off, which hides the Pay buttons" '[ "$(echo "$HEALTH" | jget "[\"payments\"]")" = "False" ]'

[ "$FAIL" -eq 0 ]

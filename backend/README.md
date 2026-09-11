# HerdCare licence service

A Cloudflare Worker (Hono) over a D1 database. It records **who has paid and who sold to them**,
issues the signed activation codes that unlock the app, takes M-Pesa payments without anyone's
help, and keeps a backup of each farmer's records against a lost phone.

Animal records live on the phone. The backup here is a safety net, not a second authority, so if
this service vanished tomorrow no farmer would lose a calving date.

## How activation works

The app verifies codes **offline**, against a public key compiled into the build. A farmer four
hours from a mast can activate from a code sent over WhatsApp, and the app never blocks on a
network request.

```
  this Worker                      the farmer's phone
  ───────────                      ──────────────────
  signs a token with the           verifies it with the public
  private key (Ed25519)     ──▶    half, offline, forever
```

A token is `HC1.<payload>.<signature>` naming the farm, plan, expiry and agent. Editing the expiry
invalidates the signature.

Signatures are byte-identical to the ones the phase-zero laptop tool produced, so every code
already issued stays valid. There is a test asserting it.

## Losing or changing a phone

**The phone number is the identity.** It is the M-Pesa number, it is already inside every token,
and it survives the handset: a stolen phone does not take the number, because Safaricom reissues
the SIM. So recovery is a flow every farmer already performs weekly.

On a replacement phone: install HerdCare, enter the M-Pesa number, receive an SMS code, type it in.
One call returns the device token, the current licence, and whatever backup is waiting. Nothing to
remember, no password, no email address.

Recovering revokes the old phone's device token, so a handset that was lost or sold cannot keep
pushing stale records over the new one. Every recovery is written to `recovery_log`, because SIM
swap is a real attack in this market and it is worth being able to look back through.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth/request` | Send a six-digit SMS code |
| `POST` | `/auth/verify` | Exchange it for a device token, licence and backup |

Codes expire in ten minutes, are single-use, allow five wrong attempts, and are capped at five per
number per hour so nobody can run up an SMS bill. Only a SHA-256 hash is stored, never the digits.
`/auth/request` deliberately says nothing about whether a number has an account, or it would become
a way to check who your customers are.

## Paying by M-Pesa, without your involvement

The farmer taps Renew, their own phone asks for their M-Pesa PIN, and the app unlocks seconds
later. No till number to copy, no receipt to forward, no agent to wait for.

```
  app  ──POST /pay──▶  Worker  ──STK push──▶  Safaricom
                                                  │
                                    farmer enters M-Pesa PIN
                                                  │
  app  ◀──new code──  Worker  ◀──callback─────────┘
       (polling /pay/:checkoutId)
```

This is the one place the app is allowed to need a network. Everything else works with no signal;
paying money to Safaricom cannot.

**The security problem worth stating plainly: Daraja callbacks carry no signature and no shared
secret.** Anyone who learns the URL can post a fake success. Three things close that, and all three
must hold before a shilling of credit is given:

1. the callback path carries an unguessable secret segment;
2. the `CheckoutRequestID` must match a `pending_payments` row **we** created;
3. the amount and payer must match what we asked Safaricom for.

Without the third, a forged callback naming a real checkout could claim one shilling bought a year.
`callbackMatchesPending` is a pure function so those rules are asserted in tests rather than
discovered in production. `payments.mpesa_ref` is `UNIQUE`, so a replayed callback cannot grant a
second month or pay a second commission.

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/pay` | Start an STK push for a plan |
| `GET` | `/pay/:checkoutId` | Poll; returns the new code once paid |
| `POST` | `/pay/callback/:secret` | Safaricom's callback. Give this URL to Daraja |

A push already outstanding for a number is returned rather than sending a second prompt, since two
prompts on one handset is how a farmer pays twice for one month.

## Cloud backup

One blob per farm, gzipped in the Worker, handed back byte for byte. The Worker never looks inside.

Deliberately a backup and not a sync. The app is offline-first and its local database is the source
of truth; a second authority that could disagree would mean conflict resolution, and a farmer whose
calving got logged twice because two devices disagreed is worse off than one with no backup at all.

| Method | Path | Auth |
|---|---|---|
| `PUT` | `/backup` | Device token |
| `GET` | `/backup` | Device token |
| `GET` | `/backup/status` | Device token |

## Agents

Agents hold their own key and can read their own book without an admin token. Keys are stored
hashed, so a leak of this table does not let anyone impersonate them.

| Method | Path | Auth |
|---|---|---|
| `GET` | `/agents/me` | Agent key |
| `GET` | `/agents/me/farms` | Agent key, soonest to lapse first |
| `GET` | `/agents/me/earnings` | Agent key |
| `POST` | `/admin/agents` | Admin, creates an agent and returns their key once |
| `POST` | `/admin/agents/:code/settle` | Admin, marks outstanding commission paid |

## Renewal reminders

A cron trigger at 03:00 UTC, which is 06:00 in Nairobi, so a warning arrives with the morning
milking rather than in the middle of the night. It warns three days ahead and once after a lapse.

The unique index on `notices(farm_id, kind, about_date)` is what stops a farmer being told the same
thing every morning until they pay. The job claims the notice by inserting first, then sends.

It queries a window rather than an exact date, so a morning the job fails to run does not silently
skip everyone due that day. `POST /admin/run-reminders` triggers it by hand while testing.

## SMS is optional

Nothing in HerdCare requires an SMS account. Two things would otherwise want one, and both have a
free path:

| Job | Free path | SMS instead |
|---|---|---|
| Warning a farmer their subscription is ending | A **local notification** from the phone itself. The expiry is inside the signed licence the app already carries, so it needs no network, no server and no account. | Reaches somebody whose phone is off or who uninstalled the app. |
| Recovering onto a new phone | **The agent issues a code** with `POST /admin/recover` and reads it to the farmer. | The farmer recovers alone, without contacting anybody. |

Leave `SMS_USERNAME` and `SMS_API_KEY` unset and both fall back to the free path automatically.
`POST /auth/request` then answers with `agentRecoveryAvailable: true` rather than a bare failure,
so the app can point the farmer at their agent.

Worth knowing before you decide: SMS is not expensive here. A farmer on the quarterly plan needs
roughly four renewal messages a year and recovers a phone almost never, so the true cost is a few
shillings per farm per year against 11,200 of revenue. The reason to skip it at launch is the
setup, not the money: an Africa's Talking account, a top-up, and a registered sender ID are all
things standing between you and your first paying farmer. Add it when that stops being true.

Agent-issued recovery has a trade-off worth being honest about: the agent sees the code, so a
dishonest agent could restore that farm's backup onto a handset of their own. Every issue and every
use is written to `recovery_log`. An agent who already visits the farm and knows the farmer by sight
is also a stronger check against a SIM swap than an SMS is.

## Setup

```bash
cd backend          # wrangler reads wrangler.toml from here, not the repo root
npm install
npx wrangler login
npx wrangler d1 migrations apply herdcare --remote
```

Then the secrets. None of these belong in `wrangler.toml` or a `[vars]` block:

```bash
# Signs activation codes. Piped so it is never displayed.
cd ../frontend && npm run --silent license -- seed | npx wrangler secret put LICENSE_SIGNING_SEED
cd ../backend

openssl rand -base64 32 | npx wrangler secret put ADMIN_TOKEN
openssl rand -hex 24   | npx wrangler secret put MPESA_CALLBACK_SECRET

npx wrangler secret put PUBLIC_BASE_URL        # https://herdcare-backend.<you>.workers.dev

# Collection, once your paybill and Daraja credentials come through.
npx wrangler secret put MPESA_CONSUMER_KEY     # from the Daraja portal
npx wrangler secret put MPESA_CONSUMER_SECRET
npx wrangler secret put MPESA_SHORTCODE        # your paybill or till number
npx wrangler secret put MPESA_SHORTCODE_TYPE   # 'paybill' (default) or 'till'
npx wrangler secret put MPESA_PASSKEY
npx wrangler secret put MPESA_ENVIRONMENT      # sandbox, then production

npx wrangler secret put SMS_USERNAME           # Africa's Talking
npx wrangler secret put SMS_API_KEY
npx wrangler secret put SMS_SENDER_ID

npm run deploy
```

Give Daraja `https://<your-worker>/pay/callback/<MPESA_CALLBACK_SECRET>` as the callback URL.

Losing `frontend/tools/.license-key.json` means never being able to renew any phone carrying the
current build. Back it up before you go further.

`GET /health` reports whether payments and SMS are configured, so you can see what is live without
guessing.

### Before real money

- Run against the **sandbox** first. `MPESA_ENVIRONMENT=sandbox` is the default.
- Going to production needs a registered business and somewhere for the money to land. Three ways,
  in the order most people should try them:

  1. **Your own till** (Buy Goods). Easier and cheaper to obtain than a paybill. Buy Goods has no
     account-number field, which does not matter here: payments are matched to a farm by the
     payer's phone number, which is the design already. Set `MPESA_SHORTCODE_TYPE=till`, because
     Daraja needs `CustomerBuyGoodsOnline` rather than `CustomerPayBillOnline` and sending the
     wrong one fails with an unhelpful error.
  2. **Your own paybill.** The most control and the lowest cost per transaction at volume, and the
     slowest to obtain.

  Aggregators such as IntaSend and Kopokopo are the usual shortcut past the paybill application,
  but they require a live business website, which is why this deployment goes direct to Daraja.
- SMS needs an Africa's Talking account. Without one, `/auth/request` returns 503 rather than
  pretending to send, because silently "succeeding" would lock every farmer out of recovery while
  looking healthy from the outside. `ALLOW_DEV_OTP=true` returns the code in the response instead,
  for testing only, and must never be set in production.

## Tests

```bash
npm test
npm run typecheck
```

61 checks. The two that matter most are the cross-check that a token this Worker signs is accepted
by the app's own library, and the forged-callback cases: a short payment, a missing receipt, a
payment from another number, a cancelled prompt, and a replay.

## Local development

`wrangler dev` needs glibc 2.32 or newer. Ubuntu 20.04 ships 2.31, so the local Workers runtime
will not start there and you will see `GLIBC_2.32 not found`. Deploying is unaffected, since that
bundles and uploads rather than running locally. Either develop against a deployed Worker, or move
to Ubuntu 22.04 or newer.

## Still to build

- **The app side of all this.** The Worker is ready; the frontend does not yet call `/auth`,
  `/pay` or `/backup`. That is the next piece of work.
- **A daily backup nudge**, once the app can upload one.
- **Cooperative check-off**, deducting subscriptions from milk payments, which would remove
  collection entirely for members.

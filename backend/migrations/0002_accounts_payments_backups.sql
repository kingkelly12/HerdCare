-- Account recovery, self-service payment, cloud backup and renewal reminders.
--
-- The thread running through all four is that a farmer's phone number is their identity. It is
-- already the M-Pesa number, it is already in every licence token, and it is the one credential a
-- Kenyan smallholder cannot lose: a stolen phone does not take the number with it, because
-- Safaricom will reissue the SIM. So recovery is "prove you still hold the number", which is a
-- flow every farmer already performs several times a week.

-- One-time codes sent by SMS. Short-lived, single-use, rate-limited.
CREATE TABLE otp_codes (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL,
  -- SHA-256 of the code, never the digits. A leaked database dump must not be a list of live codes.
  code_hash TEXT NOT NULL,
  purpose TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  -- Six digits is 1,000,000 guesses; without a ceiling that is minutes of scripted work.
  attempts INTEGER NOT NULL DEFAULT 0,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX otp_codes_phone_idx ON otp_codes(phone);
CREATE INDEX otp_codes_expires_at_idx ON otp_codes(expires_at);

-- A phone that has proved it holds the number. The device token is what authorises backup and
-- restore, so a farmer authenticates once per device rather than once per sync.
CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  -- SHA-256 of the bearer token. Same reasoning as the OTP above.
  token_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT,
  -- Set when a farmer recovers onto a new phone, so the old one stops syncing rather than
  -- silently overwriting the new one with stale records.
  revoked_at TEXT
);

CREATE INDEX devices_farm_id_idx ON devices(farm_id);

-- The farmer's records, as an encrypted-at-rest-by-Cloudflare blob we never read the inside of.
--
-- Kept as one row per farm rather than a history: this is a safety net for a lost phone, not a
-- version control system, and a smallholder's whole herd compresses to a few tens of kilobytes.
CREATE TABLE backups (
  farm_id TEXT PRIMARY KEY REFERENCES farms(id),
  -- gzipped JSON, base64. Compressed in the Worker on receipt, so the app sends plain JSON.
  payload TEXT NOT NULL,
  -- Uncompressed byte count, for the "last backed up, 142 KB" line in the app.
  size_bytes INTEGER NOT NULL,
  -- Counts from the app, so it can warn before restoring over a fuller database.
  record_count INTEGER NOT NULL DEFAULT 0,
  device_id TEXT REFERENCES devices(id),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- An STK push we asked Safaricom to send, before the farmer has typed their PIN.
--
-- This table is the reason a forged callback cannot buy anybody a subscription: a callback is only
-- honoured if its CheckoutRequestID matches a row we created here, and the amount and phone agree
-- with what we asked for.
CREATE TABLE pending_payments (
  id TEXT PRIMARY KEY,
  checkout_request_id TEXT NOT NULL UNIQUE,
  merchant_request_id TEXT,
  farm_id TEXT REFERENCES farms(id),
  phone TEXT NOT NULL,
  plan TEXT NOT NULL,
  amount REAL NOT NULL,
  -- 'pending' until Safaricom calls back, then 'paid', 'failed' or 'cancelled'.
  status TEXT NOT NULL DEFAULT 'pending',
  result_code INTEGER,
  result_desc TEXT,
  mpesa_ref TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  settled_at TEXT
);

CREATE INDEX pending_payments_status_idx ON pending_payments(status);
CREATE INDEX pending_payments_phone_idx ON pending_payments(phone);

-- What the nightly job has already said, so a farmer is nudged once about a lapse rather than
-- every morning until they pay.
CREATE TABLE notices (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  kind TEXT NOT NULL,
  -- The expiry the notice was about. Together with `kind` this makes a natural key, so the same
  -- warning about the same expiry is never sent twice even if the job runs twice.
  about_date TEXT NOT NULL,
  channel TEXT NOT NULL,
  sent_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE UNIQUE INDEX notices_once_idx ON notices(farm_id, kind, about_date);

-- Who recovered onto which phone, and when. A SIM swap is a real attack in this market, so
-- recoveries are worth being able to look back through.
CREATE TABLE recovery_log (
  id TEXT PRIMARY KEY,
  farm_id TEXT REFERENCES farms(id),
  phone TEXT NOT NULL,
  outcome TEXT NOT NULL,
  device_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX recovery_log_phone_idx ON recovery_log(phone);

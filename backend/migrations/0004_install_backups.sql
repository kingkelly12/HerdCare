-- Online backup for every install, with no sign-in.
--
-- Until now a farmer had to prove their M-Pesa number before anything could be backed up, which
-- meant most free-trial farmers had no backup at all. Now each install makes its own random key
-- on first use and backs up under it automatically. The phone number, when the app knows it, is
-- stored only as a way to find this backup again from a replacement phone, and finding it still
-- takes a code sent to that number or read out by the farmer's own agent.

CREATE TABLE installs (
  -- A random id the app makes for itself, separate from anything that travels in a backup file.
  id TEXT PRIMARY KEY,
  -- SHA-256 of the install's secret key. Whoever first sends a backup for an id owns it.
  key_hash TEXT NOT NULL,
  -- The farmer's number as the app knows it (their agent link or their licence). Unverified: it
  -- only says where to look during a recovery, which then has to be proved by a code.
  phone TEXT,
  -- The agent code saved on this phone by the farmer. Lets that agent, and only that agent, issue
  -- a recovery code for a farmer who has not paid yet and so has no row in `farms`.
  agent_code TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  last_seen_at TEXT
);

CREATE INDEX installs_phone_idx ON installs(phone);

CREATE TABLE install_backups (
  install_id TEXT PRIMARY KEY REFERENCES installs(id),
  -- gzipped JSON, base64, exactly as `backups.payload`.
  payload TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  record_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

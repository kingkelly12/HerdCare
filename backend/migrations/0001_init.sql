-- HerdCare licence service, initial schema.
--
-- This database is the record of who has paid and who sold to them. It is deliberately NOT a copy
-- of a farmer's herd: the phone remains the only place animal records live. If this database were
-- lost tomorrow, no farmer would lose a single calving date.

-- The sales people: agrovet counters, AI technicians, vets, cooperative clerks.
CREATE TABLE agents (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  -- A hashed key, never the key itself, so a dump of this table cannot impersonate an agent.
  api_key_hash TEXT,
  -- Share of every payment a farm of theirs makes, for as long as that farm stays.
  commission_rate REAL NOT NULL DEFAULT 0.10,
  -- Paid once per farm, on the first payment that is not a trial. This is what makes the visit
  -- worth taking, since 10% of one month would not be.
  activation_bounty REAL NOT NULL DEFAULT 750,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- One row per farm. `phone` is the natural key on purpose: it is the M-Pesa number, so a payment
-- notification can be matched to a farm with nothing for the farmer to type or remember.
CREATE TABLE farms (
  id TEXT PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  agent_code TEXT REFERENCES agents(code),
  plan TEXT NOT NULL,
  -- Last day covered, inclusive, as a local YYYY-MM-DD. Same format the token carries, so the
  -- server and the phone can never disagree about what "paid up to" means.
  expires_at TEXT NOT NULL,
  activated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX farms_agent_code_idx ON farms(agent_code);
CREATE INDEX farms_expires_at_idx ON farms(expires_at);

-- Money actually received. Written once per payment and never edited: the commission owed to an
-- agent is computed from these rows, so a correction belongs in a new row, not an UPDATE.
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  amount REAL NOT NULL,
  plan TEXT NOT NULL,
  -- The M-Pesa confirmation code. UNIQUE so replaying the same webhook, or an agent submitting
  -- twice because the first response was slow, cannot extend a licence or pay a commission twice.
  mpesa_ref TEXT UNIQUE,
  paid_at TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  agent_code TEXT REFERENCES agents(code),
  commission REAL NOT NULL DEFAULT 0,
  bounty REAL NOT NULL DEFAULT 0,
  -- Null until the agent has actually been paid out.
  settled_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX payments_farm_id_idx ON payments(farm_id);
CREATE INDEX payments_agent_code_idx ON payments(agent_code);
CREATE INDEX payments_settled_at_idx ON payments(settled_at);

-- Every code ever handed out. An audit trail, not a source of truth: the farm row above says what
-- is currently valid. Useful when a farmer says "the code you sent me does not work".
CREATE TABLE issued_licenses (
  id TEXT PRIMARY KEY,
  farm_id TEXT NOT NULL REFERENCES farms(id),
  token TEXT NOT NULL,
  plan TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  -- 'activate', 'renew' or 'refresh', so an unexpected burst of refreshes is visible.
  reason TEXT NOT NULL,
  issued_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX issued_licenses_farm_id_idx ON issued_licenses(farm_id);

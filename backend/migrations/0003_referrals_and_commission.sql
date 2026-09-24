-- Agents following their farmers through the free trial, and the move to a 20% commission.

-- A farmer telling us which agent helped them, sent by the farmer's own phone when they enter the
-- agent's code. This is what lets an agent see a farmer during the six free months, before any
-- money has changed hands and so before there is anything in `farms` or `payments` about them.
--
-- Deliberately separate from `farms.agent_code`. Anybody can send one of these for any phone
-- number, so a row here earns nothing and unlocks nothing: commission still follows the agent code
-- the farmer's own phone sends when they pay by M-Pesa, and recovery rights still follow `farms`.
-- A row here only puts a name on an agent's own follow-up list.
CREATE TABLE referrals (
  id TEXT PRIMARY KEY,
  -- A random id the app makes for itself on first use. One row per install, so a farmer who
  -- corrects their number or switches agent updates their row rather than adding a second one.
  install_id TEXT NOT NULL UNIQUE,
  agent_code TEXT NOT NULL REFERENCES agents(code),
  phone TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  -- Local YYYY-MM-DD, as the phone counts them. The phone is the authority on its own trial.
  trial_started_at TEXT NOT NULL,
  trial_ends_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX referrals_agent_code_idx ON referrals(agent_code);
CREATE INDEX referrals_phone_idx ON referrals(phone);

-- Every agent still on the old standard 10% moves to the new standard 20%. Agents given custom
-- terms by hand are left alone. Payments already recorded keep the commission they were recorded
-- with: those rows are a ledger and are never rewritten.
UPDATE agents SET commission_rate = 0.2 WHERE commission_rate = 0.1;

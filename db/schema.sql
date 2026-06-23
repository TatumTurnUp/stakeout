-- Stakeout database schema.
-- Run this ONCE against your Neon (or any) Postgres database, e.g. paste it into
-- the Neon SQL Editor and hit Run.

-- One row per anonymous credit token. credits = current balance.
CREATE TABLE IF NOT EXISTS accounts (
  token       TEXT PRIMARY KEY,
  credits     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Append-only history of every credit change (powers receipts later + audit).
CREATE TABLE IF NOT EXISTS ledger (
  id          BIGSERIAL PRIMARY KEY,
  token       TEXT NOT NULL,
  delta       INTEGER NOT NULL,          -- +N purchase, -1 scan, +1 refund
  reason      TEXT NOT NULL,             -- 'purchase' | 'scan' | 'refund'
  charge_id   TEXT,                      -- OpenNode charge id (purchases)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ledger_token_idx ON ledger (token);

-- One row per invoice. The status flip pending -> paid is the idempotency guard
-- that prevents double-crediting on webhook replays.
CREATE TABLE IF NOT EXISTS purchases (
  charge_id   TEXT PRIMARY KEY,          -- OpenNode charge id
  token       TEXT NOT NULL,
  credits     INTEGER NOT NULL,
  amount_usd  NUMERIC NOT NULL,
  status      TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'paid'
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  paid_at     TIMESTAMPTZ
);

-- One row per scan session. Created at scan-begin (after the credit is spent);
-- sweeps_ok lets scan-finish decide whether to refund a fully-failed scan.
CREATE TABLE IF NOT EXISTS scans (
  scan_id     TEXT PRIMARY KEY,
  token       TEXT NOT NULL,
  sweeps_ok   INTEGER NOT NULL DEFAULT 0,
  refunded    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

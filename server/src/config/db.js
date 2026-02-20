import { Pool } from 'pg';
import { env } from './env.js';

export const pool = new Pool(env.postgres);

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mints (
      id SERIAL PRIMARY KEY,
      client_id TEXT,
      name TEXT NOT NULL,
      chain TEXT NOT NULL,
      mint_date TIMESTAMPTZ NOT NULL,
      visibility TEXT NOT NULL CHECK (visibility IN ('whitelist', 'public')),
      link TEXT,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE mints ADD COLUMN IF NOT EXISTS client_id TEXT;`);
  await pool.query(`UPDATE mints SET client_id = CONCAT('legacy-', id) WHERE client_id IS NULL;`);
  await pool.query(`ALTER TABLE mints ALTER COLUMN client_id SET NOT NULL;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS mints_client_id_idx ON mints(client_id);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS reminders (
      id SERIAL PRIMARY KEY,
      mint_id INTEGER NOT NULL REFERENCES mints(id) ON DELETE CASCADE,
      offset_minutes INTEGER NOT NULL CHECK (offset_minutes IN (60, 30, 10)),
      remind_at TIMESTAMPTZ NOT NULL,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (mint_id, offset_minutes)
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS reminders_remind_at_idx ON reminders(remind_at);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS reminders_sent_at_idx ON reminders(sent_at);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notification_history (
      id SERIAL PRIMARY KEY,
      reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('web_push', 'brevo_email')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'retrying', 'sent', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      payload JSONB,
      next_retry_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (reminder_id, channel)
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS notification_history_status_idx ON notification_history(status);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS notification_history_retry_idx ON notification_history(next_retry_at);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS farming_projects (
      id SERIAL PRIMARY KEY,
      client_id TEXT,
      name TEXT NOT NULL,
      network TEXT NOT NULL,
      tasks JSONB NOT NULL DEFAULT '[]'::jsonb,
      claim_date TIMESTAMPTZ,
      reward_notes TEXT,
      progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0 AND progress <= 100),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(`ALTER TABLE farming_projects ADD COLUMN IF NOT EXISTS client_id TEXT;`);
  await pool.query(
    `UPDATE farming_projects SET client_id = CONCAT('legacy-farm-', id) WHERE client_id IS NULL OR client_id = '';`
  );
  await pool.query(`ALTER TABLE farming_projects ALTER COLUMN client_id SET NOT NULL;`);
  await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS farming_projects_client_id_idx ON farming_projects(client_id);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS farming_projects_updated_at_idx ON farming_projects(updated_at);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS alpha_tweets (
      id SERIAL PRIMARY KEY,
      tweet_id TEXT NOT NULL,
      author_id TEXT,
      author_username TEXT NOT NULL,
      text TEXT NOT NULL,
      url TEXT NOT NULL,
      matched_keywords TEXT[] NOT NULL DEFAULT '{}',
      tweeted_at TIMESTAMPTZ NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      raw_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tweet_id)
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS alpha_tweets_tweeted_at_idx ON alpha_tweets(tweeted_at DESC);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS alpha_tweets_author_idx ON alpha_tweets(author_username);`);
  await pool.query(`CREATE INDEX IF NOT EXISTS alpha_tweets_keywords_idx ON alpha_tweets USING GIN (matched_keywords);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_trackers (
      id SERIAL PRIMARY KEY,
      wallet_address TEXT NOT NULL,
      wallet_label TEXT,
      platform TEXT NOT NULL DEFAULT 'opensea',
      notify_buy BOOLEAN NOT NULL DEFAULT true,
      notify_sell BOOLEAN NOT NULL DEFAULT true,
      notify_mint BOOLEAN NOT NULL DEFAULT true,
      enabled BOOLEAN NOT NULL DEFAULT true,
      last_checked_at TIMESTAMPTZ,
      last_event_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (wallet_address, platform)
    );
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS wallet_trackers_enabled_idx
     ON wallet_trackers(enabled, updated_at DESC);`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS wallet_activity_events (
      id SERIAL PRIMARY KEY,
      tracker_id INTEGER NOT NULL REFERENCES wallet_trackers(id) ON DELETE CASCADE,
      event_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK (event_type IN ('buy', 'sell', 'mint', 'transfer')),
      tx_hash TEXT,
      token_contract TEXT,
      token_id TEXT,
      collection_slug TEXT,
      currency_symbol TEXT,
      price_value TEXT,
      from_wallet TEXT,
      to_wallet TEXT,
      event_at TIMESTAMPTZ NOT NULL,
      marketplace TEXT NOT NULL DEFAULT 'opensea',
      payload JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (tracker_id, event_id)
    );
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS wallet_activity_events_tracker_idx
     ON wallet_activity_events(tracker_id, event_at DESC);`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS wallet_activity_events_event_type_idx
     ON wallet_activity_events(event_type, event_at DESC);`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS automation_runs (
      id SERIAL PRIMARY KEY,
      workflow_key TEXT NOT NULL,
      run_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('started', 'sent', 'skipped', 'failed')),
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workflow_key, run_key)
    );
  `);

  await pool.query(`CREATE INDEX IF NOT EXISTS automation_runs_workflow_idx ON automation_runs(workflow_key, created_at DESC);`);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS automation_notification_history (
      id SERIAL PRIMARY KEY,
      workflow_key TEXT NOT NULL,
      run_key TEXT NOT NULL,
      channel TEXT NOT NULL CHECK (channel IN ('web_push', 'brevo_email')),
      status TEXT NOT NULL CHECK (status IN ('pending', 'retrying', 'sent', 'failed')),
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      payload JSONB,
      next_retry_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workflow_key, run_key, channel)
    );
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS automation_notification_retry_idx
     ON automation_notification_history(status, next_retry_at);`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS automation_billing_accounts (
      id SERIAL PRIMARY KEY,
      account_key TEXT NOT NULL UNIQUE,
      currency TEXT NOT NULL DEFAULT 'USD',
      balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
      spent_cents INTEGER NOT NULL DEFAULT 0 CHECK (spent_cents >= 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      last_charged_at TIMESTAMPTZ
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS automation_billing_transactions (
      id SERIAL PRIMARY KEY,
      account_id INTEGER NOT NULL REFERENCES automation_billing_accounts(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('charge', 'refund', 'topup', 'adjustment')),
      amount_cents INTEGER NOT NULL,
      balance_after_cents INTEGER NOT NULL CHECK (balance_after_cents >= 0),
      currency TEXT NOT NULL,
      workflow_key TEXT,
      run_key TEXT,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS automation_billing_transactions_account_idx
     ON automation_billing_transactions(account_id, created_at DESC);`
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS automation_billing_transactions_workflow_idx
     ON automation_billing_transactions(workflow_key, run_key);`
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS automation_usage_events (
      id SERIAL PRIMARY KEY,
      workflow_key TEXT NOT NULL,
      run_key TEXT NOT NULL,
      status TEXT NOT NULL CHECK (
        status IN ('free_disabled', 'blocked_insufficient_funds', 'charged', 'failed_reverted')
      ),
      price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
      currency TEXT NOT NULL,
      billing_transaction_id INTEGER REFERENCES automation_billing_transactions(id) ON DELETE SET NULL,
      details JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (workflow_key, run_key)
    );
  `);

  await pool.query(
    `CREATE INDEX IF NOT EXISTS automation_usage_events_status_idx
     ON automation_usage_events(status, created_at DESC);`
  );
}

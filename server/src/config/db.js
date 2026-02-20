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
}

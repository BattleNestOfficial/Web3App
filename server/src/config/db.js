import { Pool } from 'pg';
import { env } from './env.js';

export const pool = new Pool(env.postgres);

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mints (
      id SERIAL PRIMARY KEY,
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
}


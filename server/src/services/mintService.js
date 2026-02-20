import { pool } from '../config/db.js';

export async function listMints() {
  const result = await pool.query(
    `SELECT id, name, chain, mint_date, visibility, link, notes, created_at, updated_at
     FROM mints
     ORDER BY mint_date ASC`
  );
  return result.rows;
}

export async function getMintById(id) {
  const result = await pool.query(
    `SELECT id, name, chain, mint_date, visibility, link, notes, created_at, updated_at
     FROM mints
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createMint(input) {
  const result = await pool.query(
    `INSERT INTO mints (name, chain, mint_date, visibility, link, notes)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, name, chain, mint_date, visibility, link, notes, created_at, updated_at`,
    [input.name, input.chain, input.mintDate, input.visibility, input.link, input.notes]
  );
  return result.rows[0];
}

export async function updateMint(id, input) {
  const result = await pool.query(
    `UPDATE mints
     SET name = $2,
         chain = $3,
         mint_date = $4,
         visibility = $5,
         link = $6,
         notes = $7,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, name, chain, mint_date, visibility, link, notes, created_at, updated_at`,
    [id, input.name, input.chain, input.mintDate, input.visibility, input.link, input.notes]
  );
  return result.rows[0] ?? null;
}

export async function deleteMint(id) {
  const result = await pool.query('DELETE FROM mints WHERE id = $1 RETURNING id', [id]);
  return Boolean(result.rows[0]);
}


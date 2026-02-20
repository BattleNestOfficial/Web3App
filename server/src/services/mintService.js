import { pool } from '../config/db.js';

function buildReminderRows(mintId, mintDate, reminderOffsets) {
  return reminderOffsets.map((offsetMinutes) => ({
    mintId,
    offsetMinutes,
    remindAt: new Date(new Date(mintDate).getTime() - offsetMinutes * 60 * 1000).toISOString()
  }));
}

async function replaceRemindersForMint(client, mintId, mintDate, reminderOffsets) {
  await client.query('DELETE FROM reminders WHERE mint_id = $1', [mintId]);

  const rows = buildReminderRows(mintId, mintDate, reminderOffsets);
  if (rows.length === 0) {
    return;
  }

  const values = [];
  const params = [];

  rows.forEach((row, index) => {
    const base = index * 3;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    params.push(row.mintId, row.offsetMinutes, row.remindAt);
  });

  await client.query(
    `INSERT INTO reminders (mint_id, offset_minutes, remind_at)
     VALUES ${values.join(', ')}`,
    params
  );
}

export async function listMints() {
  const result = await pool.query(
    `SELECT id, client_id, name, chain, mint_date, visibility, link, notes, created_at, updated_at
     FROM mints
     ORDER BY mint_date ASC`
  );
  return result.rows;
}

export async function getMintById(id) {
  const result = await pool.query(
    `SELECT id, client_id, name, chain, mint_date, visibility, link, notes, created_at, updated_at
     FROM mints
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createMint(input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO mints (client_id, name, chain, mint_date, visibility, link, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (client_id)
       DO UPDATE SET
         name = EXCLUDED.name,
         chain = EXCLUDED.chain,
         mint_date = EXCLUDED.mint_date,
         visibility = EXCLUDED.visibility,
         link = EXCLUDED.link,
         notes = EXCLUDED.notes,
         updated_at = NOW()
       RETURNING id, client_id, name, chain, mint_date, visibility, link, notes, created_at, updated_at`,
      [input.clientId, input.name, input.chain, input.mintDate, input.visibility, input.link, input.notes]
    );

    const mint = result.rows[0];
    await replaceRemindersForMint(client, mint.id, mint.mint_date, input.reminderOffsets ?? []);

    await client.query('COMMIT');
    return mint;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateMint(id, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE mints
       SET client_id = $2,
           name = $3,
           chain = $4,
           mint_date = $5,
           visibility = $6,
           link = $7,
           notes = $8,
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, client_id, name, chain, mint_date, visibility, link, notes, created_at, updated_at`,
      [id, input.clientId, input.name, input.chain, input.mintDate, input.visibility, input.link, input.notes]
    );

    const mint = result.rows[0] ?? null;
    if (!mint) {
      await client.query('ROLLBACK');
      return null;
    }

    await replaceRemindersForMint(client, mint.id, mint.mint_date, input.reminderOffsets ?? []);
    await client.query('COMMIT');
    return mint;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteMint(id) {
  const result = await pool.query('DELETE FROM mints WHERE id = $1 RETURNING id', [id]);
  return Boolean(result.rows[0]);
}

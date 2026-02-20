import { pool } from '../config/db.js';

export async function listDueReminders(limit = 100) {
  const result = await pool.query(
    `SELECT
       r.id,
       r.mint_id,
       r.offset_minutes,
       r.remind_at,
       m.name AS mint_name,
       m.chain AS mint_chain,
       m.mint_date
     FROM reminders r
     INNER JOIN mints m ON m.id = r.mint_id
     WHERE r.sent_at IS NULL
       AND r.remind_at <= NOW()
     ORDER BY r.remind_at ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

export async function markReminderSent(reminderId) {
  await pool.query(
    `UPDATE reminders
     SET sent_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [reminderId]
  );
}


import { pool } from '../config/db.js';

const ALLOWED_REMINDER_OFFSETS = new Set([1440, 120, 60, 30, 10]);

function normalizeReminderOffsets(reminderOffsets) {
  const offsets = Array.isArray(reminderOffsets) ? reminderOffsets : [];
  const unique = new Set();
  for (const value of offsets) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || !ALLOWED_REMINDER_OFFSETS.has(parsed)) {
      continue;
    }
    unique.add(parsed);
  }
  return [...unique].sort((a, b) => b - a);
}

function buildReminderRows(taskId, dueAt, reminderOffsets, done, reminderEmailEnabled) {
  if (done || !reminderEmailEnabled || !dueAt) {
    return [];
  }

  const dueMs = new Date(dueAt).getTime();
  if (!Number.isFinite(dueMs)) {
    return [];
  }

  const nowMs = Date.now();
  const rows = [];

  for (const offset of normalizeReminderOffsets(reminderOffsets)) {
    const remindAtMs = dueMs - offset * 60 * 1000;
    if (remindAtMs <= nowMs) {
      continue;
    }
    rows.push({
      taskId,
      offsetMinutes: offset,
      remindAt: new Date(remindAtMs).toISOString()
    });
  }

  return rows;
}

async function replaceRemindersForTask(client, task) {
  await client.query('DELETE FROM todo_task_reminders WHERE todo_task_id = $1', [task.id]);

  const rows = buildReminderRows(
    task.id,
    task.due_at,
    task.reminder_offsets,
    task.done,
    task.reminder_email_enabled
  );
  if (rows.length === 0) {
    return;
  }

  const values = [];
  const params = [];
  rows.forEach((row, index) => {
    const base = index * 3;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    params.push(row.taskId, row.offsetMinutes, row.remindAt);
  });

  await client.query(
    `INSERT INTO todo_task_reminders (todo_task_id, offset_minutes, remind_at)
     VALUES ${values.join(', ')}`,
    params
  );
}

export async function listTodoTasks() {
  const result = await pool.query(
    `SELECT
       id,
       client_id,
       title,
       notes,
       due_at,
       priority,
       done,
       completed_at,
       reminder_email_enabled,
       reminder_offsets,
       created_at,
       updated_at
     FROM todo_tasks
     ORDER BY done ASC, due_at ASC NULLS LAST, updated_at DESC`
  );
  return result.rows;
}

export async function getTodoTaskById(id) {
  const result = await pool.query(
    `SELECT
       id,
       client_id,
       title,
       notes,
       due_at,
       priority,
       done,
       completed_at,
       reminder_email_enabled,
       reminder_offsets,
       created_at,
       updated_at
     FROM todo_tasks
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createTodoTask(input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO todo_tasks (
         client_id,
         title,
         notes,
         due_at,
         priority,
         done,
         completed_at,
         reminder_email_enabled,
         reminder_offsets
       )
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 THEN NOW() ELSE NULL END, $7, $8::INTEGER[])
       ON CONFLICT (client_id)
       DO UPDATE SET
         title = EXCLUDED.title,
         notes = EXCLUDED.notes,
         due_at = EXCLUDED.due_at,
         priority = EXCLUDED.priority,
         done = EXCLUDED.done,
         completed_at = CASE
           WHEN EXCLUDED.done = false THEN NULL
           WHEN todo_tasks.done = false THEN NOW()
           ELSE COALESCE(todo_tasks.completed_at, NOW())
         END,
         reminder_email_enabled = EXCLUDED.reminder_email_enabled,
         reminder_offsets = EXCLUDED.reminder_offsets,
         updated_at = NOW()
       RETURNING
         id,
         client_id,
         title,
         notes,
          due_at,
          priority,
          done,
          completed_at,
          reminder_email_enabled,
          reminder_offsets,
          created_at,
          updated_at`,
      [
        input.clientId,
        input.title,
        input.notes,
        input.dueAt,
        input.priority,
        input.done,
        input.reminderEmailEnabled,
        normalizeReminderOffsets(input.reminderOffsets)
      ]
    );

    const task = result.rows[0];
    await replaceRemindersForTask(client, task);

    await client.query('COMMIT');
    return task;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function updateTodoTask(id, input) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `UPDATE todo_tasks
       SET client_id = $2,
           title = $3,
           notes = $4,
            due_at = $5,
            priority = $6,
            done = $7,
            completed_at = CASE
              WHEN $7 = false THEN NULL
              WHEN done = false THEN NOW()
              ELSE COALESCE(completed_at, NOW())
            END,
            reminder_email_enabled = $8,
            reminder_offsets = $9::INTEGER[],
            updated_at = NOW()
       WHERE id = $1
       RETURNING
         id,
         client_id,
         title,
         notes,
          due_at,
          priority,
          done,
          completed_at,
          reminder_email_enabled,
          reminder_offsets,
          created_at,
         updated_at`,
      [
        id,
        input.clientId,
        input.title,
        input.notes,
        input.dueAt,
        input.priority,
        input.done,
        input.reminderEmailEnabled,
        normalizeReminderOffsets(input.reminderOffsets)
      ]
    );

    const task = result.rows[0] ?? null;
    if (!task) {
      await client.query('ROLLBACK');
      return null;
    }

    await replaceRemindersForTask(client, task);
    await client.query('COMMIT');
    return task;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function deleteTodoTask(id) {
  const result = await pool.query('DELETE FROM todo_tasks WHERE id = $1 RETURNING id', [id]);
  return Boolean(result.rows[0]);
}

export async function listDueTodoTaskReminders(limit = 100) {
  const result = await pool.query(
    `SELECT
       r.id,
       r.todo_task_id,
       r.offset_minutes,
       r.remind_at,
       t.client_id AS task_client_id,
       t.title AS task_title,
       t.notes AS task_notes,
       t.due_at,
       t.priority
     FROM todo_task_reminders r
     INNER JOIN todo_tasks t ON t.id = r.todo_task_id
     WHERE r.sent_at IS NULL
       AND r.remind_at <= NOW()
       AND t.done = false
       AND t.reminder_email_enabled = true
     ORDER BY r.remind_at ASC
     LIMIT $1`,
    [limit]
  );

  return result.rows;
}

export async function markTodoTaskReminderSent(reminderId) {
  await pool.query(
    `UPDATE todo_task_reminders
     SET sent_at = NOW(),
         updated_at = NOW()
     WHERE id = $1`,
    [reminderId]
  );
}

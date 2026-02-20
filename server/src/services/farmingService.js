import { pool } from '../config/db.js';

export async function listFarmingProjects() {
  const result = await pool.query(
    `SELECT id, client_id, name, network, tasks, claim_date, reward_notes, progress, created_at, updated_at
     FROM farming_projects
     ORDER BY updated_at DESC`
  );
  return result.rows;
}

export async function getFarmingProjectById(id) {
  const result = await pool.query(
    `SELECT id, client_id, name, network, tasks, claim_date, reward_notes, progress, created_at, updated_at
     FROM farming_projects
     WHERE id = $1`,
    [id]
  );
  return result.rows[0] ?? null;
}

export async function createFarmingProject(input) {
  const result = await pool.query(
    `INSERT INTO farming_projects (client_id, name, network, tasks, claim_date, reward_notes, progress)
     VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)
     ON CONFLICT (client_id)
     DO UPDATE SET
       name = EXCLUDED.name,
       network = EXCLUDED.network,
       tasks = EXCLUDED.tasks,
       claim_date = EXCLUDED.claim_date,
       reward_notes = EXCLUDED.reward_notes,
       progress = EXCLUDED.progress,
       updated_at = NOW()
     RETURNING id, client_id, name, network, tasks, claim_date, reward_notes, progress, created_at, updated_at`,
    [
      input.clientId,
      input.name,
      input.network,
      JSON.stringify(input.tasks),
      input.claimDate,
      input.rewardNotes,
      input.progress
    ]
  );
  return result.rows[0];
}

export async function updateFarmingProject(id, input) {
  const result = await pool.query(
    `UPDATE farming_projects
     SET client_id = $2,
         name = $3,
         network = $4,
         tasks = $5::jsonb,
         claim_date = $6,
         reward_notes = $7,
         progress = $8,
         updated_at = NOW()
     WHERE id = $1
     RETURNING id, client_id, name, network, tasks, claim_date, reward_notes, progress, created_at, updated_at`,
    [
      id,
      input.clientId,
      input.name,
      input.network,
      JSON.stringify(input.tasks),
      input.claimDate,
      input.rewardNotes,
      input.progress
    ]
  );
  return result.rows[0] ?? null;
}

export async function deleteFarmingProject(id) {
  const result = await pool.query('DELETE FROM farming_projects WHERE id = $1 RETURNING id', [id]);
  return Boolean(result.rows[0]);
}

import { pool } from '../config/db.js';
import { env } from '../config/env.js';

const DEFAULT_ACCOUNT_KEY = 'default';

const USAGE_STATUS = {
  FREE_DISABLED: 'free_disabled',
  BLOCKED: 'blocked_insufficient_funds',
  CHARGED: 'charged',
  FAILED_REVERTED: 'failed_reverted'
};

const WORKFLOW_PRICING_MAP = {
  daily_briefing_email: () => env.automation.pricing.dailyBriefingCents,
  missed_task_alert: () => env.automation.pricing.missedTaskAlertCents,
  inactive_farming_alert: () => env.automation.pricing.inactiveFarmingAlertCents,
  weekly_productivity_report: () => env.automation.pricing.weeklyReportCents
};

function normalizeCents(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.floor(numeric));
}

function normalizeLimit(value, fallback = 20, max = 100) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(numeric)));
}

function jsonString(value) {
  return JSON.stringify(value ?? {});
}

function validateWorkflowInput(workflowKey, runKey) {
  if (!workflowKey || typeof workflowKey !== 'string') {
    throw new Error('workflowKey is required.');
  }
  if (!runKey || typeof runKey !== 'string') {
    throw new Error('runKey is required.');
  }
}

export function getWorkflowPriceCents(workflowKey) {
  const getter = WORKFLOW_PRICING_MAP[workflowKey];
  if (!getter) return 0;
  return normalizeCents(getter(), 0);
}

export function getAutomationPricingConfig() {
  return {
    dailyBriefingCents: normalizeCents(env.automation.pricing.dailyBriefingCents, 0),
    missedTaskAlertCents: normalizeCents(env.automation.pricing.missedTaskAlertCents, 0),
    inactiveFarmingAlertCents: normalizeCents(env.automation.pricing.inactiveFarmingAlertCents, 0),
    weeklyReportCents: normalizeCents(env.automation.pricing.weeklyReportCents, 0)
  };
}

async function ensureDefaultAccount(client) {
  const defaultBalanceCents = normalizeCents(env.automation.defaultBalanceCents, 0);

  await client.query(
    `INSERT INTO automation_billing_accounts (account_key, currency, balance_cents, spent_cents)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (account_key)
     DO NOTHING`,
    [DEFAULT_ACCOUNT_KEY, env.automation.currency, defaultBalanceCents]
  );

  const accountResult = await client.query(
    `SELECT id, account_key, currency, balance_cents, spent_cents, last_charged_at
     FROM automation_billing_accounts
     WHERE account_key = $1
     FOR UPDATE`,
    [DEFAULT_ACCOUNT_KEY]
  );

  return accountResult.rows[0];
}

async function upsertUsageEvent(client, payload) {
  const result = await client.query(
    `INSERT INTO automation_usage_events (
        workflow_key, run_key, status, price_cents, currency, billing_transaction_id, details
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
     ON CONFLICT (workflow_key, run_key)
     DO UPDATE SET
       status = EXCLUDED.status,
       price_cents = EXCLUDED.price_cents,
       currency = EXCLUDED.currency,
       billing_transaction_id = EXCLUDED.billing_transaction_id,
       details = COALESCE(automation_usage_events.details, '{}'::jsonb) || EXCLUDED.details,
       updated_at = NOW()
     RETURNING id, workflow_key, run_key, status, price_cents, currency, billing_transaction_id, details`,
    [
      payload.workflowKey,
      payload.runKey,
      payload.status,
      normalizeCents(payload.priceCents, 0),
      payload.currency || env.automation.currency,
      payload.billingTransactionId ?? null,
      jsonString(payload.details)
    ]
  );

  return result.rows[0];
}

async function insertBillingTransaction(client, payload) {
  const result = await client.query(
    `INSERT INTO automation_billing_transactions (
       account_id, kind, amount_cents, balance_after_cents, currency, workflow_key, run_key, details
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
     RETURNING id, account_id, kind, amount_cents, balance_after_cents, currency, workflow_key, run_key, details, created_at`,
    [
      payload.accountId,
      payload.kind,
      payload.amountCents,
      payload.balanceAfterCents,
      payload.currency,
      payload.workflowKey ?? null,
      payload.runKey ?? null,
      jsonString(payload.details)
    ]
  );

  return result.rows[0];
}

async function upsertFreeUsage(workflowKey, runKey, details = {}) {
  await pool.query(
    `INSERT INTO automation_usage_events (workflow_key, run_key, status, price_cents, currency, details)
     VALUES ($1, $2, $3, 0, $4, $5::jsonb)
     ON CONFLICT (workflow_key, run_key)
     DO UPDATE SET
       status = EXCLUDED.status,
       details = COALESCE(automation_usage_events.details, '{}'::jsonb) || EXCLUDED.details,
       updated_at = NOW()`,
    [workflowKey, runKey, USAGE_STATUS.FREE_DISABLED, env.automation.currency, jsonString(details)]
  );
}

export async function chargeWorkflowRun({ workflowKey, runKey, details = {} }) {
  validateWorkflowInput(workflowKey, runKey);

  const priceCents = getWorkflowPriceCents(workflowKey);
  if (!env.automation.payPerUseEnabled || priceCents <= 0) {
    await upsertFreeUsage(workflowKey, runKey, {
      ...details,
      reason: env.automation.payPerUseEnabled ? 'non-billable-workflow' : 'pay-per-use-disabled'
    });
    return {
      allowed: true,
      charged: false,
      status: USAGE_STATUS.FREE_DISABLED,
      priceCents: 0,
      currency: env.automation.currency
    };
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const existingResult = await client.query(
      `SELECT id, status, price_cents, billing_transaction_id
       FROM automation_usage_events
       WHERE workflow_key = $1 AND run_key = $2
       FOR UPDATE`,
      [workflowKey, runKey]
    );
    const existing = existingResult.rows[0] ?? null;
    if (existing) {
      if (existing.status === USAGE_STATUS.CHARGED) {
        await client.query('COMMIT');
        return {
          allowed: true,
          charged: true,
          status: USAGE_STATUS.CHARGED,
          priceCents: normalizeCents(existing.price_cents, priceCents),
          currency: env.automation.currency,
          idempotent: true
        };
      }

      if (existing.status === USAGE_STATUS.BLOCKED || existing.status === USAGE_STATUS.FAILED_REVERTED) {
        await client.query('COMMIT');
        return {
          allowed: false,
          charged: false,
          status: existing.status,
          priceCents: normalizeCents(existing.price_cents, priceCents),
          currency: env.automation.currency,
          idempotent: true
        };
      }
    }

    const account = await ensureDefaultAccount(client);
    const currentBalance = normalizeCents(account.balance_cents, 0);
    const currentSpent = normalizeCents(account.spent_cents, 0);

    if (currentBalance < priceCents) {
      await upsertUsageEvent(client, {
        workflowKey,
        runKey,
        status: USAGE_STATUS.BLOCKED,
        priceCents,
        currency: account.currency,
        details: {
          ...details,
          reason: 'insufficient-balance',
          accountBalanceCents: currentBalance
        }
      });

      await client.query('COMMIT');
      return {
        allowed: false,
        charged: false,
        status: USAGE_STATUS.BLOCKED,
        priceCents,
        currency: account.currency,
        balanceCents: currentBalance
      };
    }

    const nextBalance = currentBalance - priceCents;
    const nextSpent = currentSpent + priceCents;

    await client.query(
      `UPDATE automation_billing_accounts
       SET balance_cents = $2,
           spent_cents = $3,
           last_charged_at = NOW(),
           updated_at = NOW()
       WHERE id = $1`,
      [account.id, nextBalance, nextSpent]
    );

    const transaction = await insertBillingTransaction(client, {
      accountId: account.id,
      kind: 'charge',
      amountCents: -priceCents,
      balanceAfterCents: nextBalance,
      currency: account.currency,
      workflowKey,
      runKey,
      details
    });

    await upsertUsageEvent(client, {
      workflowKey,
      runKey,
      status: USAGE_STATUS.CHARGED,
      priceCents,
      currency: account.currency,
      billingTransactionId: transaction.id,
      details
    });

    await client.query('COMMIT');
    return {
      allowed: true,
      charged: true,
      status: USAGE_STATUS.CHARGED,
      priceCents,
      currency: account.currency,
      balanceCents: nextBalance,
      transactionId: transaction.id
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function refundWorkflowCharge({
  workflowKey,
  runKey,
  reason = 'workflow-send-failed',
  details = {}
}) {
  validateWorkflowInput(workflowKey, runKey);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const usageResult = await client.query(
      `SELECT id, status, price_cents, currency, billing_transaction_id
       FROM automation_usage_events
       WHERE workflow_key = $1 AND run_key = $2
       FOR UPDATE`,
      [workflowKey, runKey]
    );
    const usage = usageResult.rows[0] ?? null;
    if (!usage || usage.status !== USAGE_STATUS.CHARGED) {
      await client.query('COMMIT');
      return { refunded: false, reason: 'not-charged' };
    }

    const account = await ensureDefaultAccount(client);
    const currentBalance = normalizeCents(account.balance_cents, 0);
    const currentSpent = normalizeCents(account.spent_cents, 0);
    const refundCents = normalizeCents(usage.price_cents, 0);
    const nextBalance = currentBalance + refundCents;
    const nextSpent = Math.max(0, currentSpent - refundCents);

    await client.query(
      `UPDATE automation_billing_accounts
       SET balance_cents = $2,
           spent_cents = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [account.id, nextBalance, nextSpent]
    );

    const refundTransaction = await insertBillingTransaction(client, {
      accountId: account.id,
      kind: 'refund',
      amountCents: refundCents,
      balanceAfterCents: nextBalance,
      currency: account.currency,
      workflowKey,
      runKey,
      details: {
        reason,
        chargeTransactionId: usage.billing_transaction_id ?? null,
        ...details
      }
    });

    await upsertUsageEvent(client, {
      workflowKey,
      runKey,
      status: USAGE_STATUS.FAILED_REVERTED,
      priceCents: refundCents,
      currency: usage.currency || account.currency,
      billingTransactionId: refundTransaction.id,
      details: {
        reason,
        refunded: true,
        chargeTransactionId: usage.billing_transaction_id ?? null,
        ...details
      }
    });

    await client.query('COMMIT');
    return {
      refunded: true,
      refundCents,
      currency: account.currency,
      balanceCents: nextBalance,
      transactionId: refundTransaction.id
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function topUpAutomationBalance({ amountCents, source = 'manual_topup', details = {} }) {
  const normalizedAmountCents = normalizeCents(amountCents, 0);
  if (normalizedAmountCents <= 0) {
    throw new Error('Top-up amount must be a positive integer number of cents.');
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const account = await ensureDefaultAccount(client);
    const currentBalance = normalizeCents(account.balance_cents, 0);
    const nextBalance = currentBalance + normalizedAmountCents;

    await client.query(
      `UPDATE automation_billing_accounts
       SET balance_cents = $2,
           updated_at = NOW()
       WHERE id = $1`,
      [account.id, nextBalance]
    );

    const transaction = await insertBillingTransaction(client, {
      accountId: account.id,
      kind: 'topup',
      amountCents: normalizedAmountCents,
      balanceAfterCents: nextBalance,
      currency: account.currency,
      details: {
        source,
        ...details
      }
    });

    await client.query('COMMIT');

    return {
      amountCents: normalizedAmountCents,
      balanceCents: nextBalance,
      spentCents: normalizeCents(account.spent_cents, 0),
      currency: account.currency,
      transactionId: transaction.id,
      source
    };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function getAutomationBillingSummary({ usageLimit = 25, transactionLimit = 25 } = {}) {
  const normalizedUsageLimit = normalizeLimit(usageLimit, 25, 200);
  const normalizedTransactionLimit = normalizeLimit(transactionLimit, 25, 200);
  const defaultBalanceCents = normalizeCents(env.automation.defaultBalanceCents, 0);

  await pool.query(
    `INSERT INTO automation_billing_accounts (account_key, currency, balance_cents, spent_cents)
     VALUES ($1, $2, $3, 0)
     ON CONFLICT (account_key)
     DO NOTHING`,
    [DEFAULT_ACCOUNT_KEY, env.automation.currency, defaultBalanceCents]
  );

  const [accountResult, usageResult, transactionsResult, totalsResult] = await Promise.all([
    pool.query(
      `SELECT account_key, currency, balance_cents, spent_cents, created_at, updated_at, last_charged_at
       FROM automation_billing_accounts
       WHERE account_key = $1`,
      [DEFAULT_ACCOUNT_KEY]
    ),
    pool.query(
      `SELECT id, workflow_key, run_key, status, price_cents, currency, billing_transaction_id, details, created_at, updated_at
       FROM automation_usage_events
       ORDER BY created_at DESC
       LIMIT $1`,
      [normalizedUsageLimit]
    ),
    pool.query(
      `SELECT id, kind, amount_cents, balance_after_cents, currency, workflow_key, run_key, details, created_at
       FROM automation_billing_transactions
       ORDER BY created_at DESC
       LIMIT $1`,
      [normalizedTransactionLimit]
    ),
    pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'charged')::int AS charged_runs,
         COUNT(*) FILTER (WHERE status = 'blocked_insufficient_funds')::int AS blocked_runs,
         COUNT(*) FILTER (WHERE status = 'failed_reverted')::int AS reverted_runs,
         COALESCE(SUM(price_cents) FILTER (WHERE status = 'charged'), 0)::int AS total_charged_cents
       FROM automation_usage_events`
    )
  ]);

  const account = accountResult.rows[0] ?? null;
  const totals = totalsResult.rows[0] ?? {
    charged_runs: 0,
    blocked_runs: 0,
    reverted_runs: 0,
    total_charged_cents: 0
  };

  return {
    payPerUseEnabled: env.automation.payPerUseEnabled,
    account: {
      accountKey: account?.account_key ?? DEFAULT_ACCOUNT_KEY,
      currency: account?.currency ?? env.automation.currency,
      balanceCents: normalizeCents(account?.balance_cents, defaultBalanceCents),
      spentCents: normalizeCents(account?.spent_cents, 0),
      lastChargedAt: account?.last_charged_at ?? null,
      createdAt: account?.created_at ?? null,
      updatedAt: account?.updated_at ?? null
    },
    pricing: getAutomationPricingConfig(),
    totals: {
      chargedRuns: normalizeCents(totals.charged_runs, 0),
      blockedRuns: normalizeCents(totals.blocked_runs, 0),
      revertedRuns: normalizeCents(totals.reverted_runs, 0),
      totalChargedCents: normalizeCents(totals.total_charged_cents, 0)
    },
    recentUsage: usageResult.rows,
    recentTransactions: transactionsResult.rows
  };
}

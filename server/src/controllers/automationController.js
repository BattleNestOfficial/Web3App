import { ApiError } from '../utils/ApiError.js';
import {
  getAutomationBillingSummary,
  topUpAutomationBalance
} from '../services/automationBillingService.js';

function parseLimit(value, fallback) {
  if (value === undefined) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    throw new ApiError(400, 'Query parameter "limit" must be a positive number.');
  }
  return Math.floor(numeric);
}

function parseTopUpAmountCents(body) {
  const hasAmountCents = body?.amountCents !== undefined;
  const hasAmountUsd = body?.amountUsd !== undefined;

  if (!hasAmountCents && !hasAmountUsd) {
    throw new ApiError(400, 'Provide either "amountCents" or "amountUsd".');
  }

  if (hasAmountCents) {
    const cents = Number(body.amountCents);
    if (!Number.isFinite(cents) || cents <= 0) {
      throw new ApiError(400, '"amountCents" must be a positive number.');
    }
    return Math.floor(cents);
  }

  const usd = Number(body.amountUsd);
  if (!Number.isFinite(usd) || usd <= 0) {
    throw new ApiError(400, '"amountUsd" must be a positive number.');
  }

  return Math.round(usd * 100);
}

export async function getAutomationBilling(req, res) {
  const usageLimit = parseLimit(req.query.usageLimit, 25);
  const transactionLimit = parseLimit(req.query.transactionLimit, 25);

  const summary = await getAutomationBillingSummary({
    usageLimit,
    transactionLimit
  });

  res.json({ data: summary });
}

export async function postAutomationTopUp(req, res) {
  const amountCents = parseTopUpAmountCents(req.body ?? {});
  const sourceRaw = typeof req.body?.source === 'string' ? req.body.source.trim() : '';
  const source = sourceRaw || 'manual_api';
  const noteRaw = typeof req.body?.note === 'string' ? req.body.note.trim() : '';
  const note = noteRaw || null;

  const topup = await topUpAutomationBalance({
    amountCents,
    source,
    details: note ? { note } : {}
  });

  res.status(201).json({ data: topup });
}

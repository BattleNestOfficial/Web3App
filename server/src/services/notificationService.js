import webpush from 'web-push';
import { pool } from '../config/db.js';
import { env } from '../config/env.js';

const CHANNEL_WEB_PUSH = 'web_push';
const CHANNEL_BREVO_EMAIL = 'brevo_email';

const MAX_RETRIES = Math.max(1, env.notification.maxRetries);
const RETRY_BASE_MS = Math.max(1, env.notification.retryBaseSeconds) * 1000;

let webPushConfigured = false;

function getEnabledChannels() {
  const channels = [];

  const webPushConfig = env.notification.webPush;
  if (
    webPushConfig.vapidSubject &&
    webPushConfig.vapidPublicKey &&
    webPushConfig.vapidPrivateKey &&
    Array.isArray(webPushConfig.subscriptions) &&
    webPushConfig.subscriptions.length > 0
  ) {
    channels.push(CHANNEL_WEB_PUSH);
  }

  const brevoConfig = env.notification.brevo;
  if (brevoConfig.apiKey && brevoConfig.senderEmail && brevoConfig.recipientEmail) {
    channels.push(CHANNEL_BREVO_EMAIL);
  }

  return channels;
}

export function getEnabledNotificationChannels() {
  return getEnabledChannels();
}

async function getOrCreateHistory(reminderId, channel, payload) {
  const existing = await pool.query(
    `SELECT id, reminder_id, channel, status, attempts, last_error, payload, next_retry_at, sent_at
     FROM notification_history
     WHERE reminder_id = $1 AND channel = $2`,
    [reminderId, channel]
  );

  if (existing.rows[0]) {
    return existing.rows[0];
  }

  const created = await pool.query(
    `INSERT INTO notification_history (reminder_id, channel, status, attempts, payload)
     VALUES ($1, $2, 'pending', 0, $3::jsonb)
     RETURNING id, reminder_id, channel, status, attempts, last_error, payload, next_retry_at, sent_at`,
    [reminderId, channel, JSON.stringify(payload)]
  );

  return created.rows[0];
}

function toDate(value) {
  if (!value) return null;
  return value instanceof Date ? value : new Date(value);
}

function shouldAttempt(history) {
  if (history.status === 'sent') {
    return false;
  }

  if (history.status === 'failed' && history.attempts >= MAX_RETRIES) {
    return false;
  }

  const nextRetryAt = toDate(history.next_retry_at);
  if (nextRetryAt && nextRetryAt.getTime() > Date.now()) {
    return false;
  }

  return true;
}

async function markHistorySent(history) {
  const attempts = Number(history.attempts || 0) + 1;

  await pool.query(
    `UPDATE notification_history
     SET status = 'sent',
         attempts = $2,
         sent_at = NOW(),
         next_retry_at = NULL,
         last_error = NULL,
         updated_at = NOW()
     WHERE id = $1`,
    [history.id, attempts]
  );
}

async function markHistoryFailure(history, error) {
  const attempts = Number(history.attempts || 0) + 1;
  const exceeded = attempts >= MAX_RETRIES;
  const delayMs = Math.min(60 * 60 * 1000, RETRY_BASE_MS * 2 ** (attempts - 1));
  const nextRetryAt = exceeded ? null : new Date(Date.now() + delayMs).toISOString();
  const message = error instanceof Error ? error.message : String(error);

  await pool.query(
    `UPDATE notification_history
     SET status = $2,
         attempts = $3,
         last_error = $4,
         next_retry_at = $5,
         updated_at = NOW()
     WHERE id = $1`,
    [history.id, exceeded ? 'failed' : 'retrying', attempts, message.slice(0, 1000), nextRetryAt]
  );
}

function buildPushPayload(reminder) {
  return {
    title: 'Mint reminder',
    body: `${reminder.mint_name} (${reminder.mint_chain}) starts in ${reminder.offset_minutes} minutes.`,
    data: {
      reminderId: reminder.id,
      mintId: reminder.mint_id,
      mintName: reminder.mint_name,
      chain: reminder.mint_chain,
      mintDate: reminder.mint_date,
      remindAt: reminder.remind_at
    }
  };
}

async function sendWebPushNotification(reminder) {
  const config = env.notification.webPush;
  if (
    !config.vapidSubject ||
    !config.vapidPublicKey ||
    !config.vapidPrivateKey ||
    !Array.isArray(config.subscriptions) ||
    config.subscriptions.length === 0
  ) {
    throw new Error('Web push is not configured.');
  }

  if (!webPushConfigured) {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey);
    webPushConfigured = true;
  }

  const payload = JSON.stringify(buildPushPayload(reminder));
  let delivered = 0;
  const failures = [];

  for (const subscription of config.subscriptions) {
    try {
      await webpush.sendNotification(subscription, payload);
      delivered += 1;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : String(error));
    }
  }

  if (delivered === 0) {
    throw new Error(`Web push failed for all subscriptions. ${failures.join(' | ')}`);
  }
}

function buildBrevoEmail(reminder) {
  return {
    sender: {
      name: env.notification.brevo.senderName,
      email: env.notification.brevo.senderEmail
    },
    to: [
      {
        email: env.notification.brevo.recipientEmail,
        name: env.notification.brevo.recipientName
      }
    ],
    subject: `Mint reminder: ${reminder.mint_name} in ${reminder.offset_minutes}m`,
    textContent: `${reminder.mint_name} on ${reminder.mint_chain} starts in ${reminder.offset_minutes} minutes.`,
    htmlContent: `
      <p><strong>Mint reminder</strong></p>
      <p>${reminder.mint_name} (${reminder.mint_chain}) starts in <strong>${reminder.offset_minutes} minutes</strong>.</p>
      <p>Mint time: ${new Date(reminder.mint_date).toISOString()}</p>
    `
  };
}

async function sendBrevoEmail(reminder) {
  const config = env.notification.brevo;
  if (!config.apiKey || !config.senderEmail || !config.recipientEmail) {
    throw new Error('Brevo email is not configured.');
  }

  if (typeof fetch !== 'function') {
    throw new Error('Global fetch is unavailable. Use Node.js 18+ or provide a fetch polyfill.');
  }

  const response = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': config.apiKey
    },
    body: JSON.stringify(buildBrevoEmail(reminder))
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`Brevo request failed (${response.status}): ${bodyText}`);
  }
}

async function sendThroughChannel(channel, reminder) {
  if (channel === CHANNEL_WEB_PUSH) {
    await sendWebPushNotification(reminder);
    return;
  }
  if (channel === CHANNEL_BREVO_EMAIL) {
    await sendBrevoEmail(reminder);
    return;
  }
  throw new Error(`Unsupported notification channel: ${channel}`);
}

export async function triggerReminderNotification(reminder) {
  const channels = getEnabledNotificationChannels();
  if (channels.length === 0) {
    throw new Error('No notification channels configured.');
  }

  let allDelivered = true;

  const payload = {
    reminderId: reminder.id,
    mintId: reminder.mint_id,
    mintName: reminder.mint_name,
    chain: reminder.mint_chain,
    offsetMinutes: reminder.offset_minutes,
    remindAt: reminder.remind_at
  };

  for (const channel of channels) {
    const history = await getOrCreateHistory(reminder.id, channel, payload);

    if (!shouldAttempt(history)) {
      if (history.status !== 'sent') {
        allDelivered = false;
      }
      continue;
    }

    try {
      await sendThroughChannel(channel, reminder);
      await markHistorySent(history);
    } catch (error) {
      allDelivered = false;
      await markHistoryFailure(history, error);
    }
  }

  return {
    delivered: allDelivered,
    channels
  };
}

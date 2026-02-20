import dotenv from 'dotenv';

dotenv.config();

function getEnv(name, fallback = undefined) {
  const value = process.env[name];
  if (value === undefined || value === '') {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getOptionalEnv(name, fallback = '') {
  const value = process.env[name];
  if (value === undefined || value === '') {
    return fallback;
  }
  return value;
}

function parseNumber(name, fallback) {
  const raw = getEnv(name, String(fallback));
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }
  return value;
}

function parseOptionalNumber(name, fallback) {
  const raw = getOptionalEnv(name, String(fallback));
  const value = Number(raw);
  if (Number.isNaN(value)) {
    throw new Error(`Environment variable ${name} must be a number.`);
  }
  return value;
}

function parseOptionalBoolean(name, fallback = false) {
  const raw = getOptionalEnv(name, fallback ? 'true' : 'false').toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(raw)) return true;
  if (['0', 'false', 'no', 'off'].includes(raw)) return false;
  throw new Error(`Environment variable ${name} must be a boolean.`);
}

function parseJsonArray(name, fallback = []) {
  const raw = getOptionalEnv(name, '');
  if (!raw) return fallback;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      throw new Error('Expected an array.');
    }
    return parsed;
  } catch (error) {
    throw new Error(`Environment variable ${name} must be valid JSON array: ${String(error)}`);
  }
}

function parseCsv(name, fallback = []) {
  const raw = getOptionalEnv(name, '');
  if (!raw) return fallback;
  return raw
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function resolvePostgresConfig() {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    return { connectionString: databaseUrl };
  }

  return {
    host: getEnv('PGHOST'),
    port: parseNumber('PGPORT', 5432),
    user: getEnv('PGUSER'),
    password: getEnv('PGPASSWORD'),
    database: getEnv('PGDATABASE')
  };
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  port: parseNumber('PORT', 4000),
  postgres: resolvePostgresConfig(),
  firebase: {
    projectId: getEnv('FIREBASE_PROJECT_ID'),
    clientEmail: getEnv('FIREBASE_CLIENT_EMAIL'),
    privateKey: getEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n')
  },
  notification: {
    maxRetries: parseOptionalNumber('NOTIFICATION_MAX_RETRIES', 5),
    retryBaseSeconds: parseOptionalNumber('NOTIFICATION_RETRY_BASE_SECONDS', 60),
    webPush: {
      vapidSubject: getOptionalEnv('WEB_PUSH_VAPID_SUBJECT'),
      vapidPublicKey: getOptionalEnv('WEB_PUSH_VAPID_PUBLIC_KEY'),
      vapidPrivateKey: getOptionalEnv('WEB_PUSH_VAPID_PRIVATE_KEY'),
      subscriptions: parseJsonArray('WEB_PUSH_SUBSCRIPTIONS_JSON', [])
    },
    brevo: {
      apiKey: getOptionalEnv('BREVO_API_KEY'),
      senderEmail: getOptionalEnv('BREVO_SENDER_EMAIL'),
      senderName: getOptionalEnv('BREVO_SENDER_NAME', 'Mint Tracker'),
      recipientEmail: getOptionalEnv('BREVO_RECIPIENT_EMAIL'),
      recipientName: getOptionalEnv('BREVO_RECIPIENT_NAME', 'Operator')
    }
  },
  twitter: {
    bearerToken: getOptionalEnv('TWITTER_BEARER_TOKEN'),
    trackedAccounts: parseCsv('TWITTER_TRACKED_ACCOUNTS', []),
    keywords: parseCsv('TWITTER_KEYWORDS', ['mint', 'testnet', 'airdrop']),
    fetchLimit: parseOptionalNumber('TWITTER_FETCH_LIMIT', 25),
    requestTimeoutMs: parseOptionalNumber('TWITTER_REQUEST_TIMEOUT_MS', 15000)
  },
  ai: {
    openAiApiKey: getOptionalEnv('OPENAI_API_KEY'),
    openAiModel: getOptionalEnv('OPENAI_MODEL', 'gpt-4o-mini'),
    requestTimeoutMs: parseOptionalNumber('OPENAI_REQUEST_TIMEOUT_MS', 20000)
  },
  automation: {
    payPerUseEnabled: parseOptionalBoolean('AUTOMATION_PAY_PER_USE_ENABLED', false),
    currency: getOptionalEnv('AUTOMATION_CURRENCY', 'USD'),
    defaultBalanceCents: parseOptionalNumber('AUTOMATION_DEFAULT_BALANCE_CENTS', 0),
    dailyBriefingHourUtc: parseOptionalNumber('AUTOMATION_DAILY_BRIEFING_HOUR_UTC', 8),
    weeklyReportDayUtc: parseOptionalNumber('AUTOMATION_WEEKLY_REPORT_DAY_UTC', 1),
    weeklyReportHourUtc: parseOptionalNumber('AUTOMATION_WEEKLY_REPORT_HOUR_UTC', 8),
    inactiveFarmingDays: parseOptionalNumber('AUTOMATION_INACTIVE_FARMING_DAYS', 3),
    missedTaskLookbackHours: parseOptionalNumber('AUTOMATION_MISSED_TASK_LOOKBACK_HOURS', 24),
    pricing: {
      dailyBriefingCents: parseOptionalNumber('AUTOMATION_PRICE_DAILY_BRIEFING_CENTS', 100),
      missedTaskAlertCents: parseOptionalNumber('AUTOMATION_PRICE_MISSED_TASK_ALERT_CENTS', 60),
      inactiveFarmingAlertCents: parseOptionalNumber('AUTOMATION_PRICE_INACTIVE_FARMING_ALERT_CENTS', 60),
      weeklyReportCents: parseOptionalNumber('AUTOMATION_PRICE_WEEKLY_REPORT_CENTS', 180)
    }
  }
};

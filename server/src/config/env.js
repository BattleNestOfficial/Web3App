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
  }
};

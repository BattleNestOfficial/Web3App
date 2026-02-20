const IST_OFFSET_MINUTES = 330;

const TIMEZONE_OFFSETS = {
  UTC: 0,
  GMT: 0,
  IST: 330,
  EST: -300,
  EDT: -240,
  CST: -360,
  CDT: -300,
  MST: -420,
  MDT: -360,
  PST: -480,
  PDT: -420
} as const;

export type MintTimezone = keyof typeof TIMEZONE_OFFSETS;

export const TIMEZONE_OPTIONS: Array<{ value: MintTimezone; label: string }> = [
  { value: 'IST', label: 'IST (UTC+05:30)' },
  { value: 'UTC', label: 'UTC (UTC+00:00)' },
  { value: 'GMT', label: 'GMT (UTC+00:00)' },
  { value: 'EST', label: 'EST (UTC-05:00)' },
  { value: 'EDT', label: 'EDT (UTC-04:00)' },
  { value: 'CST', label: 'CST (UTC-06:00)' },
  { value: 'CDT', label: 'CDT (UTC-05:00)' },
  { value: 'MST', label: 'MST (UTC-07:00)' },
  { value: 'MDT', label: 'MDT (UTC-06:00)' },
  { value: 'PST', label: 'PST (UTC-08:00)' },
  { value: 'PDT', label: 'PDT (UTC-07:00)' }
];

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12
};

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function getTimezoneOffsetMinutes(timezone: string): number {
  const normalized = String(timezone ?? '')
    .trim()
    .toUpperCase();
  if (!(normalized in TIMEZONE_OFFSETS)) {
    throw new Error('Unsupported timezone. Choose one from the dropdown.');
  }
  return TIMEZONE_OFFSETS[normalized as MintTimezone];
}

function normalizeHour(hour: number, meridiem?: string) {
  const marker = (meridiem ?? '').toLowerCase();
  if (!marker) return hour;
  if (hour < 1 || hour > 12) return Number.NaN;
  if (marker === 'am') return hour % 12;
  if (marker === 'pm') return hour % 12 + 12;
  return Number.NaN;
}

function toUtcTimestamp(parts: DateParts, offsetMinutes: number) {
  return (
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second) -
    offsetMinutes * 60_000
  );
}

function isValidDateParts(parts: DateParts) {
  if (parts.month < 1 || parts.month > 12) return false;
  if (parts.day < 1 || parts.day > 31) return false;
  if (parts.hour < 0 || parts.hour > 23) return false;
  if (parts.minute < 0 || parts.minute > 59) return false;
  if (parts.second < 0 || parts.second > 59) return false;
  const test = new Date(Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second));
  return (
    test.getUTCFullYear() === parts.year &&
    test.getUTCMonth() === parts.month - 1 &&
    test.getUTCDate() === parts.day &&
    test.getUTCHours() === parts.hour &&
    test.getUTCMinutes() === parts.minute &&
    test.getUTCSeconds() === parts.second
  );
}

function parseNumberDateInput(input: string): DateParts | null {
  const normalized = input.trim().replace(/\s+/g, ' ');

  let match = normalized.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[,\sT]+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(am|pm)?)?$/i
  );
  if (match) {
    const hourRaw = match[4] ? Number(match[4]) : 0;
    const hour = normalizeHour(hourRaw, match[7]);
    const parts: DateParts = {
      year: Number(match[1]),
      month: Number(match[2]),
      day: Number(match[3]),
      hour,
      minute: match[5] ? Number(match[5]) : 0,
      second: match[6] ? Number(match[6]) : 0
    };
    return isValidDateParts(parts) ? parts : null;
  }

  // day-first (common in India): DD/MM/YYYY or DD-MM-YYYY
  match = normalized.match(
    /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[,\sT]+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(am|pm)?)?$/i
  );
  if (match) {
    const hourRaw = match[4] ? Number(match[4]) : 0;
    const hour = normalizeHour(hourRaw, match[7]);
    const parts: DateParts = {
      year: Number(match[3]),
      month: Number(match[2]),
      day: Number(match[1]),
      hour,
      minute: match[5] ? Number(match[5]) : 0,
      second: match[6] ? Number(match[6]) : 0
    };
    return isValidDateParts(parts) ? parts : null;
  }

  return null;
}

function parseNamedMonthInput(input: string): DateParts | null {
  const normalized = input.trim().replace(/,/g, ' ').replace(/\s+/g, ' ');

  let match = normalized.match(
    /^([A-Za-z]{3,9})\s+(\d{1,2})\s+(\d{4})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(am|pm)?)?$/i
  );
  if (match) {
    const month = MONTHS[match[1].toLowerCase()];
    if (!month) return null;
    const hourRaw = match[4] ? Number(match[4]) : 0;
    const hour = normalizeHour(hourRaw, match[7]);
    const parts: DateParts = {
      year: Number(match[3]),
      month,
      day: Number(match[2]),
      hour,
      minute: match[5] ? Number(match[5]) : 0,
      second: match[6] ? Number(match[6]) : 0
    };
    return isValidDateParts(parts) ? parts : null;
  }

  match = normalized.match(
    /^(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})(?:\s+(\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?\s*(am|pm)?)?$/i
  );
  if (match) {
    const month = MONTHS[match[2].toLowerCase()];
    if (!month) return null;
    const hourRaw = match[4] ? Number(match[4]) : 0;
    const hour = normalizeHour(hourRaw, match[7]);
    const parts: DateParts = {
      year: Number(match[3]),
      month,
      day: Number(match[1]),
      hour,
      minute: match[5] ? Number(match[5]) : 0,
      second: match[6] ? Number(match[6]) : 0
    };
    return isValidDateParts(parts) ? parts : null;
  }

  return null;
}

function parseDateParts(input: string) {
  return parseNumberDateInput(input) ?? parseNamedMonthInput(input);
}

export function splitTimestampByTimezone(timestamp: number, timezone: MintTimezone = 'IST') {
  const offsetMinutes = getTimezoneOffsetMinutes(timezone);
  const shifted = timestamp + offsetMinutes * 60_000;
  const date = new Date(shifted);
  return {
    date: `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`,
    time: `${pad2(date.getUTCHours())}:${pad2(date.getUTCMinutes())}`,
    timezone
  };
}

export function parseDateTimeSelection(dateValue: string, timeValue: string, timezone: string) {
  const dateMatch = String(dateValue ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = String(timeValue ?? '').trim().match(/^(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) {
    throw new Error('Please select valid mint date and time.');
  }

  const parts: DateParts = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: 0
  };

  if (!isValidDateParts(parts)) {
    throw new Error('Please select a valid mint date/time.');
  }

  return toUtcTimestamp(parts, getTimezoneOffsetMinutes(timezone));
}

export function toIstDateInputValue(timestamp: number) {
  const shifted = timestamp + IST_OFFSET_MINUTES * 60_000;
  const iso = new Date(shifted).toISOString().slice(0, 16).replace('T', ' ');
  return `${iso} IST`;
}

export function formatMintDate(timestamp: number) {
  const value = new Date(timestamp).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
  return `${value} IST`;
}

export function formatCountdown(targetMs: number, nowMs: number) {
  const diff = targetMs - nowMs;

  if (diff <= 0) {
    return 'Mint live';
  }

  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  const seconds = Math.floor((diff % (60 * 1000)) / 1000);

  const segments = [
    days > 0 ? `${days}d` : null,
    `${hours.toString().padStart(2, '0')}h`,
    `${minutes.toString().padStart(2, '0')}m`,
    `${seconds.toString().padStart(2, '0')}s`
  ].filter(Boolean);

  return segments.join(' ');
}

export function parseDateInput(value: string) {
  const raw = value.trim();
  if (!raw) {
    throw new Error('Please enter a mint date and time.');
  }

  const explicitOffsetTimestamp = Date.parse(raw);
  if (/[zZ]$|[+-]\d{2}:\d{2}$|[+-]\d{4}$/.test(raw) && Number.isFinite(explicitOffsetTimestamp)) {
    return explicitOffsetTimestamp;
  }

  const tzMatch = raw.match(/\b([A-Za-z]{2,5})$/);
  if (tzMatch) {
    const zone = tzMatch[1].toUpperCase();
    if (zone in TIMEZONE_OFFSETS) {
      const withoutZone = raw.slice(0, raw.length - tzMatch[0].length).trim();
      const parts = parseDateParts(withoutZone);
      if (parts) {
        return toUtcTimestamp(parts, getTimezoneOffsetMinutes(zone));
      }

      const offsetMinutes = getTimezoneOffsetMinutes(zone);
      const sign = offsetMinutes >= 0 ? '+' : '-';
      const absMinutes = Math.abs(offsetMinutes);
      const tzToken = `${sign}${pad2(Math.floor(absMinutes / 60))}:${pad2(absMinutes % 60)}`;
      const fallbackTimestamp = Date.parse(`${withoutZone} ${tzToken}`);
      if (Number.isFinite(fallbackTimestamp)) {
        return fallbackTimestamp;
      }
    }
  }

  const parts = parseDateParts(raw);
  if (parts) {
    return toUtcTimestamp(parts, IST_OFFSET_MINUTES);
  }

  const fallbackIstTimestamp = Date.parse(`${raw} +05:30`);
  if (Number.isFinite(fallbackIstTimestamp)) {
    return fallbackIstTimestamp;
  }

  throw new Error(
    'Invalid mint date. Use formats like "2026-03-01 6:00 PM EST", "2026-03-01 23:30 GMT", or "2026-03-02 07:30" (IST).'
  );
}

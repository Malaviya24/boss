import { AppError } from '../../utils/errors.js';

const TWELVE_HOUR_TIME_PATTERN = /^(\d{1,2}):(\d{2})\s*([AP]M)$/i;
const TWENTY_FOUR_HOUR_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function getDateTimeParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => Number.parseInt(parts.find((part) => part.type === type)?.value ?? '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function getOffsetMs(date, timeZone) {
  const parts = getDateTimeParts(date, timeZone);
  const zonedUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return zonedUtcMs - date.getTime();
}

function buildDateInTimeZone({ year, month, day, hour, minute, second = 0 }, timeZone) {
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const offsetMs = getOffsetMs(new Date(guessUtcMs), timeZone);
  return new Date(guessUtcMs - offsetMs);
}

export function normalizeMarketTime(rawValue = '') {
  const value = String(rawValue).trim().toUpperCase();
  if (!value) {
    throw new AppError('Time value is required', {
      statusCode: 400,
      code: 'INVALID_MARKET_TIME',
    });
  }

  const direct = value.match(TWENTY_FOUR_HOUR_TIME_PATTERN);
  if (direct) {
    return `${direct[1]}:${direct[2]}`;
  }

  const twelveHour = value.match(TWELVE_HOUR_TIME_PATTERN);
  if (!twelveHour) {
    throw new AppError('Invalid time format. Use HH:mm or hh:mm AM/PM', {
      statusCode: 400,
      code: 'INVALID_MARKET_TIME',
    });
  }

  let hour = Number.parseInt(twelveHour[1], 10);
  const minute = Number.parseInt(twelveHour[2], 10);
  const meridiem = twelveHour[3];

  if (hour < 1 || hour > 12) {
    throw new AppError('Invalid hour value', {
      statusCode: 400,
      code: 'INVALID_MARKET_TIME',
    });
  }

  if (meridiem === 'AM') {
    hour = hour === 12 ? 0 : hour;
  } else {
    hour = hour === 12 ? 12 : hour + 12;
  }

  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function formatTo12Hour(time24 = '') {
  const match = String(time24).match(TWENTY_FOUR_HOUR_TIME_PATTERN);
  if (!match) {
    return time24;
  }

  const hour24 = Number.parseInt(match[1], 10);
  const minute = match[2];
  const meridiem = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${String(hour12).padStart(2, '0')}:${minute} ${meridiem}`;
}

export function getCurrentDateKey(timeZone) {
  const now = getDateTimeParts(new Date(), timeZone);
  return `${now.year}-${String(now.month).padStart(2, '0')}-${String(now.day).padStart(2, '0')}`;
}

export function getScheduledDateForToday(time24 = '', timeZone) {
  const match = String(time24).match(TWENTY_FOUR_HOUR_TIME_PATTERN);
  if (!match) {
    throw new AppError('Invalid time value', {
      statusCode: 400,
      code: 'INVALID_MARKET_TIME',
    });
  }

  const now = getDateTimeParts(new Date(), timeZone);
  return buildDateInTimeZone(
    {
      year: now.year,
      month: now.month,
      day: now.day,
      hour: Number.parseInt(match[1], 10),
      minute: Number.parseInt(match[2], 10),
      second: 0,
    },
    timeZone,
  );
}

export function toIsoStringOrNull(value) {
  return value instanceof Date && Number.isFinite(value.getTime()) ? value.toISOString() : null;
}

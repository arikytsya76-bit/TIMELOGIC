const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function isValidTime(value) {
  return typeof value === 'string' && TIME_PATTERN.test(value);
}

function isValidTimeZone(value) {
  if (!value || typeof value !== 'string') return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function safeTimeZone(value) {
  return isValidTimeZone(value) ? value : 'Africa/Lagos';
}

function zonedParts(value = new Date(), timeZone = 'Africa/Lagos') {
  const date = value instanceof Date ? value : new Date(value);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTimeZone(timeZone),
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, Number(part.value)])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
    second: parts.second,
  };
}

function dateKey(value = new Date(), timeZone = 'Africa/Lagos') {
  const p = zonedParts(value, timeZone);
  return `${String(p.year).padStart(4, '0')}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function isSunday(value = new Date(), timeZone = 'Africa/Lagos') {
  const p = zonedParts(value, timeZone);
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() === 0;
}

function dateOnly(value = new Date(), timeZone = 'Africa/Lagos') {
  return new Date(`${dateKey(value, timeZone)}T00:00:00.000Z`);
}

function timeZoneOffsetMs(value, timeZone) {
  const date = value instanceof Date ? value : new Date(value);
  const p = zonedParts(date, timeZone);
  const representedAsUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function zonedDateTimeToUtc(parts, timeZone) {
  const guess = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour || 0, parts.minute || 0, parts.second || 0);
  let result = guess - timeZoneOffsetMs(new Date(guess), timeZone);
  const correctedOffset = timeZoneOffsetMs(new Date(result), timeZone);
  result = guess - correctedOffset;
  return new Date(result);
}

function dayBounds(value = new Date(), timeZone = 'Africa/Lagos') {
  const tz = safeTimeZone(timeZone);
  const p = zonedParts(value, tz);
  const start = zonedDateTimeToUtc({ ...p, hour: 0, minute: 0, second: 0 }, tz);
  const nextCalendarDay = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  const endParts = {
    year: nextCalendarDay.getUTCFullYear(),
    month: nextCalendarDay.getUTCMonth() + 1,
    day: nextCalendarDay.getUTCDate(),
    hour: 0, minute: 0, second: 0,
  };
  return { start, end: zonedDateTimeToUtc(endParts, tz), date: dateOnly(value, tz), key: dateKey(value, tz) };
}

function atZonedTime(value, hhmm, timeZone = 'Africa/Lagos', dayOffset = 0) {
  if (!isValidTime(hhmm)) return null;
  const tz = safeTimeZone(timeZone);
  const p = zonedParts(value, tz);
  const calendarDay = new Date(Date.UTC(p.year, p.month - 1, p.day + dayOffset));
  const [hour, minute] = hhmm.split(':').map(Number);
  return zonedDateTimeToUtc({
    year: calendarDay.getUTCFullYear(),
    month: calendarDay.getUTCMonth() + 1,
    day: calendarDay.getUTCDate(),
    hour,
    minute,
    second: 0,
  }, tz);
}

function openingOccurrence(value, openingTime, timeZone = 'Africa/Lagos', closeTime = null, openingReference = null) {
  if (!isValidTime(openingTime)) return null;
  const tz = safeTimeZone(timeZone);

  // A session may begin shortly before opening or during an overnight shift.
  // Use the same-day opening before a normal shift; after midnight in an
  // overnight shift, keep the session attached to the previous opening.
  if (openingReference) {
    const reference = openingReference instanceof Date ? openingReference : new Date(openingReference);
    if (!Number.isNaN(reference.getTime())) {
      const candidates = [0, -1, 1]
        .map((offset) => atZonedTime(reference, openingTime, tz, offset))
        .filter(Boolean);
      const sameDay = atZonedTime(reference, openingTime, tz);
      const local = zonedParts(reference, tz);
      const [openHour, openMinute] = openingTime.split(':').map(Number);
      const [closeHour, closeMinute] = isValidTime(closeTime) ? closeTime.split(':').map(Number) : [null, null];
      const overnight = closeHour != null && (closeHour * 60 + closeMinute) <= (openHour * 60 + openMinute);
      const afterMidnight = overnight && (local.hour * 60 + local.minute) < (closeHour * 60 + closeMinute);
      if (sameDay && sameDay > reference && !afterMidnight) return sameDay;

      const previous = candidates
        .filter((candidate) => candidate <= reference)
        .sort((left, right) => right.getTime() - left.getTime())[0];
      return previous || sameDay || candidates.sort((left, right) => left.getTime() - right.getTime())[0];
    }
  }

  // Without a session reference, use the current local work day. Times after
  // midnight but before an overnight office closes belong to yesterday's open.
  let dayOffset = 0;
  if (isValidTime(closeTime)) {
    const [openHour, openMinute] = openingTime.split(':').map(Number);
    const [closeHour, closeMinute] = closeTime.split(':').map(Number);
    const openMinutes = openHour * 60 + openMinute;
    const closeMinutes = closeHour * 60 + closeMinute;
    const local = zonedParts(value, tz);
    const currentMinutes = local.hour * 60 + local.minute;
    if (closeMinutes <= openMinutes && currentMinutes < closeMinutes) dayOffset = -1;
  }
  return atZonedTime(value, openingTime, tz, dayOffset);
}

function attendanceDate(value, policy = {}) {
  const tz = safeTimeZone(policy.timezone || 'Africa/Lagos');
  const opening = openingOccurrence(
    value,
    policy.openTime || '08:00',
    tz,
    policy.closeTime,
    policy.openingReference
  );
  return opening ? dateOnly(opening, tz) : dateOnly(value, tz);
}

function minutesAfterOpening(value, openingTime, timeZone = 'Africa/Lagos', closeTime = null, openingReference = null) {
  if (!isValidTime(openingTime)) return 0;
  const instant = value instanceof Date ? value : new Date(value);
  const opening = openingOccurrence(instant, openingTime, timeZone, closeTime, openingReference);
  return opening ? (instant.getTime() - opening.getTime()) / 60000 : 0;
}

function evaluateAttendance(value, policy = {}) {
  const minutes = minutesAfterOpening(
    value,
    policy.openTime || '08:00',
    policy.timezone || 'Africa/Lagos',
    policy.closeTime,
    policy.openingReference
  );
  const grace = Number.isFinite(Number(policy.graceMinutes)) ? Number(policy.graceMinutes) : 30;
  const lateAfter = Number.isFinite(Number(policy.lateAfterMinutes)) ? Number(policy.lateAfterMinutes) : 90;
  const gracePenalty = Number.isFinite(Number(policy.gracePenalty)) ? Number(policy.gracePenalty) : 0;
  const latePenalty = Number.isFinite(Number(policy.latePenalty)) ? Number(policy.latePenalty) : 0;

  if (minutes <= grace) {
    return { status: 'PRESENT', penalty: 0, minutesLate: Math.max(0, Math.floor(minutes)) };
  }
  if (minutes <= lateAfter) {
    return { status: 'PRESENT', penalty: gracePenalty, minutesLate: Math.max(0, Math.floor(minutes)) };
  }
  return { status: 'LATE', penalty: latePenalty, minutesLate: Math.max(0, Math.floor(minutes)) };
}

module.exports = {
  isValidTime,
  isValidTimeZone,
  safeTimeZone,
  zonedParts,
  dateKey,
  isSunday,
  dateOnly,
  dayBounds,
  atZonedTime,
  openingOccurrence,
  attendanceDate,
  minutesAfterOpening,
  evaluateAttendance,
};

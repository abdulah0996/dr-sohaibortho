function minutesFromStrictTime(value) {
  const match = String(value || "").match(/^(\d{2}):(\d{2})$/);
  if (!match) return NaN;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return NaN;
  return hour * 60 + minute;
}

function isValidTimeWindow(start, end) {
  const startMinutes = minutesFromStrictTime(start);
  const endMinutes = minutesFromStrictTime(end);
  return Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && startMinutes < endMinutes;
}

function isValidTimezone(value) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: value }).format(); return true; }
  catch { return false; }
}

function isValidWeeklyHours(hours, slotDurationMinutes) {
  if (!Array.isArray(hours) || hours.length !== 7 || new Set(hours.map((entry) => Number(entry.day))).size !== 7) return false;
  const duration = Number(slotDurationMinutes);
  return Number.isInteger(duration) && duration > 0 && hours.every((entry) => {
    const start = minutesFromStrictTime(entry.start);
    const end = minutesFromStrictTime(entry.end);
    return isValidTimeWindow(entry.start, entry.end) && (end - start) % duration === 0;
  });
}

module.exports = { minutesFromStrictTime, isValidTimeWindow, isValidTimezone, isValidWeeklyHours };

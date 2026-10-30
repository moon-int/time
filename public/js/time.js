// "local" always means: don't pass a timeZone to Intl, so the runtime's own
// local zone is used — this keeps the local zone as the always-available default.
export function effectiveTimeZone(timezone) {
  return timezone && timezone !== "local" ? timezone : undefined;
}

const partsFormatterCache = new Map();
export function zonedParts(date, timeZone) {
  const cacheKey = timeZone || "__local__";
  let dtf = partsFormatterCache.get(cacheKey);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    partsFormatterCache.set(cacheKey, dtf);
  }
  const map = {};
  dtf.formatToParts(date).forEach((p) => {
    map[p.type] = p.value;
  });
  let h = parseInt(map.hour, 10);
  if (h === 24) h = 0;
  return { h, m: parseInt(map.minute, 10), s: parseInt(map.second, 10) };
}

export function zonedDateKey(date, timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

const WEEKDAY_INDEX = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const weekdayFormatterCache = new Map();
// Returns 0-6 (Sun-Sat), matching the value scheme used by <input> weekday
// checkboxes in the schedule form.
export function zonedWeekday(date, timeZone) {
  const cacheKey = timeZone || "__local__";
  let dtf = weekdayFormatterCache.get(cacheKey);
  if (!dtf) {
    dtf = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" });
    weekdayFormatterCache.set(cacheKey, dtf);
  }
  return WEEKDAY_INDEX[dtf.format(date)];
}

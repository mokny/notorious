const DAY_MS = 24 * 60 * 60 * 1000;
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]; // matches 0=Sun..6=Sat convention used throughout this module

interface ZonedParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0=Sun..6=Sat
}

/** Reads the wall-clock date/time `instant` falls on in `timeZone`, via the only timezone-aware primitive `Date` exposes. */
function getZonedParts(instant: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    weekday: "short",
  });
  const parts = formatter.formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  const weekday = WEEKDAY_NAMES.indexOf(get("weekday"));
  const hour = Number(get("hour"));
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
    hour: hour === 24 ? 0 : hour, // some locales/zones format midnight as "24:00"
    minute: Number(get("minute")),
    weekday,
  };
}

/**
 * The UTC instant at which the wall clock in `timeZone` reads
 * `year-month-day hour:minute`. Native `Date` has no timezone-aware
 * constructor, so this guesses the instant assuming UTC, checks what that
 * guess actually reads as in `timeZone`, and corrects by the difference -
 * converges in at most two passes (the only case needing a second pass is a
 * correction that itself crosses a DST transition).
 */
function zonedTimeToUtc(year: number, month: number, day: number, hour: number, minute: number, timeZone: string): Date {
  const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let guess = target;
  for (let i = 0; i < 2; i++) {
    const parts = getZonedParts(new Date(guess), timeZone);
    const guessedAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, 0, 0);
    const diff = target - guessedAsUtc;
    if (diff === 0) break;
    guess += diff;
  }
  return new Date(guess);
}

/** Adds `days` to a calendar date, ignoring time-of-day entirely - safe to compute via `Date.UTC` as a neutral day counter since only the resulting y/m/d fields are read back out. */
function addCalendarDays(year: number, month: number, day: number, days: number): { year: number; month: number; day: number } {
  const shifted = new Date(Date.UTC(year, month - 1, day) + days * DAY_MS);
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

/** The Monday of the week containing `date`, as a calendar date in `timeZone`. */
function localMondayOf(date: Date, timeZone: string): { year: number; month: number; day: number } {
  const parts = getZonedParts(date, timeZone);
  const dayOffset = parts.weekday === 0 ? -6 : 1 - parts.weekday;
  return addCalendarDays(parts.year, parts.month, parts.day, dayOffset);
}

/** Monday 00:00 (local time in `timeZone`) of the week containing `date`, as an ISO instant - the anchor a schedule's `intervalWeeks` counts from. */
export function currentWeekMonday(timeZone: string, date = new Date()): string {
  const { year, month, day } = localMondayOf(date, timeZone);
  return zonedTimeToUtc(year, month, day, 0, 0, timeZone).toISOString();
}

/**
 * Next ISO instant, strictly after `after`, on which a schedule should fire.
 * `weekdays`/`time` are interpreted as local wall-clock values in `timezone`
 * (see `BackupScheduleInput`'s doc comment) - all calendar arithmetic below
 * happens on plain y/m/d triples (DST-agnostic) and only the final
 * date+time-of-day candidate is converted to a real UTC instant, so a
 * schedule keeps firing at the same local wall-clock time across DST
 * transitions.
 *
 * Weeks are counted from `anchorWeekStart` (a Monday, same `timezone`) -
 * only weeks where `(weekIndex % intervalWeeks) === 0` are eligible, so
 * "every 2 weeks" always lands on the same weeks regardless of when the
 * schedule was edited.
 */
export function computeNextRunAt(params: {
  weekdays: number[]; // 0=Sun..6=Sat
  time: string; // HH:MM, local to `timezone`
  timezone: string;
  intervalWeeks: number;
  anchorWeekStart: string;
  after: Date;
}): Date {
  const { weekdays, time, timezone, intervalWeeks, anchorWeekStart, after } = params;
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!timeMatch) throw new Error("Invalid schedule time");
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const anchor = localMondayOf(new Date(anchorWeekStart), timezone);
  const sortedDays = [...weekdays].sort((a, b) => a - b);

  const MAX_WEEKS = 520; // ~10 years safety bound
  for (let weekIndex = 0; weekIndex < MAX_WEEKS; weekIndex++) {
    if (weekIndex % intervalWeeks !== 0) continue;
    const weekMonday = addCalendarDays(anchor.year, anchor.month, anchor.day, weekIndex * 7);

    for (const weekday of sortedDays) {
      const dayOffset = weekday === 0 ? 6 : weekday - 1; // Mon(1)=+0 .. Sat(6)=+5, Sun(0)=+6
      const candidateDate = addCalendarDays(weekMonday.year, weekMonday.month, weekMonday.day, dayOffset);
      const candidate = zonedTimeToUtc(candidateDate.year, candidateDate.month, candidateDate.day, hours, minutes, timezone);
      if (candidate.getTime() > after.getTime()) return candidate;
    }
  }
  throw new Error("Could not compute next backup run");
}

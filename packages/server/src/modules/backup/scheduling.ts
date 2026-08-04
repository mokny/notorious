/** Monday 00:00 UTC of the week containing `date`, as an ISO string - the anchor a schedule's `intervalWeeks` counts from. */
export function currentWeekMonday(date = new Date()): string {
  return mondayOf(date).toISOString();
}

function mondayOf(date: Date): Date {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() + (day === 0 ? -6 : 1 - day));
  return d;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Next ISO instant, strictly after `after`, on which a schedule should fire.
 * Weeks are counted from `anchorWeekStart` (a Monday) - only weeks where
 * `(weekIndex % intervalWeeks) === 0` are eligible, so "every 2 weeks"
 * always lands on the same weeks regardless of when the schedule was edited.
 */
export function computeNextRunAt(params: {
  weekdays: number[]; // 0=Sun..6=Sat
  time: string; // HH:MM
  intervalWeeks: number;
  anchorWeekStart: string;
  after: Date;
}): Date {
  const { weekdays, time, intervalWeeks, anchorWeekStart, after } = params;
  const timeMatch = /^(\d{2}):(\d{2})$/.exec(time);
  if (!timeMatch) throw new Error("Invalid schedule time");
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  const anchor = mondayOf(new Date(anchorWeekStart));
  const sortedDays = [...weekdays].sort((a, b) => a - b);

  const MAX_WEEKS = 520; // ~10 years safety bound
  for (let weekIndex = 0; weekIndex < MAX_WEEKS; weekIndex++) {
    if (weekIndex % intervalWeeks !== 0) continue;
    const weekMonday = new Date(anchor.getTime() + weekIndex * 7 * DAY_MS);

    for (const weekday of sortedDays) {
      const dayOffset = weekday === 0 ? 6 : weekday - 1; // Mon(1)=+0 .. Sat(6)=+5, Sun(0)=+6
      const candidate = new Date(weekMonday.getTime() + dayOffset * DAY_MS);
      candidate.setUTCHours(hours, minutes, 0, 0);
      if (candidate.getTime() > after.getTime()) return candidate;
    }
  }
  throw new Error("Could not compute next backup run");
}

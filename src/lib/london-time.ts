const WEEKDAY_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export interface LondonNow {
  date: string; // YYYY-MM-DD, today's calendar date in Europe/London
  weekday: number; // 0 = Sunday .. 6 = Saturday, in Europe/London
  hour: number; // 0-23, current hour in Europe/London
  minute: number;
}

/**
 * Reads the current wall-clock date/time in Europe/London regardless of the
 * server's own timezone (Vercel runs in UTC), using the IANA tz database via
 * Intl so British Summer Time is handled automatically -- no hard-coded UTC
 * offset.
 */
export function getLondonNow(reference: Date = new Date()): LondonNow {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts: Record<string, string> = {};
  for (const part of formatter.formatToParts(reference)) {
    parts[part.type] = part.value;
  }

  // Some ICU implementations render midnight as "24" with hour12: false.
  const hour = parts.hour === "24" ? 0 : Number(parts.hour);

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    weekday: WEEKDAY_INDEX[parts.weekday],
    hour,
    minute: Number(parts.minute),
  };
}

/**
 * Whether the given London wall-clock time falls within `toleranceMinutes`
 * of `targetHour:00`. Used instead of an exact-hour match because on
 * Vercel's Hobby plan a single fixed-UTC weekly cron can't track the
 * GMT/BST change, so it's deliberately scheduled at the midpoint between
 * the two seasons' equivalent times -- landing up to ~30 minutes either
 * side of the target hour depending on the time of year. A tolerant window
 * (rather than `hour === targetHour`) means that offset can never cause a
 * reminder to be silently skipped for landing in the "wrong" hour.
 */
export function isWithinMinutesOfHour(
  london: LondonNow,
  targetHour: number,
  toleranceMinutes: number
): boolean {
  const currentMinutes = london.hour * 60 + london.minute;
  const targetMinutes = targetHour * 60;
  return Math.abs(currentMinutes - targetMinutes) <= toleranceMinutes;
}

/** Adds `days` calendar days to a plain YYYY-MM-DD date, no timezone involved. */
export function addDaysToISODate(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

function weekdayOfISODate(isoDate: string): number {
  return new Date(`${isoDate}T00:00:00Z`).getUTCDay();
}

/**
 * The next Sunday on or after `isoDate`. With `strictlyAfter: true`, today
 * (if it is itself a Sunday) is skipped in favour of the following week --
 * used for the Sunday-evening "next Sunday" advance notice.
 */
export function nextSunday(
  isoDate: string,
  { strictlyAfter }: { strictlyAfter: boolean }
): string {
  const weekday = weekdayOfISODate(isoDate);
  let days = (7 - weekday) % 7;
  if (days === 0 && strictlyAfter) days = 7;
  return addDaysToISODate(isoDate, days);
}

/** e.g. "Sunday, 20 September" -- no year, matching the required message copy. */
export function formatFriendlySundayDate(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(date);
}

// Calendar-day helpers for stopping running timers at the end of the day they were started on.

const dayFormatters = new Map<string, Intl.DateTimeFormat>()

function dayFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = dayFormatters.get(timeZone)
  if (!formatter) {
    // en-CA formats dates as YYYY-MM-DD, which compares correctly as a string.
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    dayFormatters.set(timeZone, formatter)
  }
  return formatter
}

/** Whether `timeZone` is an IANA time zone this runtime knows. */
export function isValidTimeZone(timeZone: unknown): timeZone is string {
  if (typeof timeZone !== 'string' || timeZone.length === 0 || timeZone.length > 100) return false
  try {
    dayFormatter(timeZone)
    return true
  } catch {
    return false
  }
}

/** The first valid time zone among `candidates`, or UTC. */
export function resolveTimeZone(...candidates: unknown[]): string {
  return candidates.find(isValidTimeZone) ?? 'UTC'
}

/** The calendar day (YYYY-MM-DD) of `instantMs` in `timeZone`. */
export function zonedDay(instantMs: number, timeZone: string): string {
  return dayFormatter(timeZone).format(new Date(instantMs))
}

// A calendar day lasts at most 25 hours (or 48 when a zone skips a whole day), so the next day has begun by then.
const SEARCH_WINDOW_MS = 49 * 60 * 60 * 1000

/**
 * The first instant after `startMs` that falls on a later calendar day in `timeZone`: 24:00 of the start day.
 * Searched rather than computed from offsets, so 23- and 25-hour days and zones whose clocks skip midnight
 * are handled the same way.
 */
export function endOfZonedDay(startMs: number, timeZone: string): number {
  const startDay = zonedDay(startMs, timeZone)
  let before = startMs
  let after = startMs + SEARCH_WINDOW_MS
  while (after - before > 1) {
    const middle = before + Math.floor((after - before) / 2)
    if (zonedDay(middle, timeZone) > startDay) after = middle
    else before = middle
  }
  return after
}

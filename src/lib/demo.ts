// Demo mode helpers for the web app. The account list and schedule come from the seed's own modules, so the
// sign-in screen and the banner cannot drift from what the daily reset creates.
import { DEMO_RESET_HOUR, DEMO_RESET_TIME_ZONE } from '../../functions/src/demo/schedule'

/** The public repository, linked from the demo UI so visitors can find the source and self-host it. */
export const DEMO_SOURCE_URL = 'https://github.com/kacper-szewczyk/Ticknest'
/** Where visitors who like the project can support the author. */
export const DEMO_SUPPORT_URL = 'https://buymeacoffee.com/kszewczyk'
/** How visitors can reach the author for help with setup or custom features. */
export const DEMO_CONTACT_EMAIL = 'kacper.szewczyk.sp@gmail.com'
export const DEMO_CONTACT_LINKEDIN_URL = 'https://www.linkedin.com/in/kacperszewczyk'

export { DEMO_ACCOUNTS, type DemoAccount, type DemoAccountRole } from '../../functions/src/demo/accounts'

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value)
  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
    hour: value('hour'),
    minute: value('minute'),
    second: value('second'),
  }
}

/** Milliseconds `timeZone` is ahead of UTC at `date`. */
function offsetMs(date: Date, timeZone: string): number {
  const parts = zonedParts(date, timeZone)
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second)
  return asUtc - Math.floor(date.getTime() / 1000) * 1000
}

/** The instant a wall-clock time occurs in `timeZone`. Day overflow (for example day 32) rolls into the next month. */
function zonedTimeToDate(year: number, month: number, day: number, hour: number, timeZone: string): Date {
  const wallClockAsUtc = Date.UTC(year, month - 1, day, hour)
  const guess = wallClockAsUtc - offsetMs(new Date(wallClockAsUtc), timeZone)
  // A second pass corrects the guess when a DST change falls between the wall-clock time and the instant.
  return new Date(wallClockAsUtc - offsetMs(new Date(guess), timeZone))
}

/** The next daily demo reset strictly after `now`, following the Cloud Scheduler schedule in the seed config. */
export function nextDemoReset(now: Date): Date {
  const today = zonedParts(now, DEMO_RESET_TIME_ZONE)
  const todaysReset = zonedTimeToDate(today.year, today.month, today.day, DEMO_RESET_HOUR, DEMO_RESET_TIME_ZONE)
  if (todaysReset.getTime() > now.getTime()) return todaysReset
  return zonedTimeToDate(today.year, today.month, today.day + 1, DEMO_RESET_HOUR, DEMO_RESET_TIME_ZONE)
}

/** Formats the reset instant in the viewer's own time zone, for example "Tue, 03:00 CET". */
export function formatDemoReset(reset: Date, locale?: string, timeZone?: string): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(reset)
}

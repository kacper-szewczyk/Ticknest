// Whether Google Calendar suggestions are set up. Kept apart from `googleCalendar.ts`, so screens that only need to
// know whether to show the feature do not pull the Calendar API code into the first page load.

/** The OAuth client ID the instance owner created for Calendar access; empty when the feature is not set up. */
export function googleCalendarClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID ?? '').trim()
}

/** The feature shows only when an OAuth client is configured, and never in the public demo. */
export function isGoogleCalendarAvailable(): boolean {
  return googleCalendarClientId() !== '' && import.meta.env.VITE_DEMO_MODE !== 'true'
}

import { useSyncExternalStore } from 'react'
import { currentCalendarToken, subscribeToCalendarToken } from './lib/googleCalendar'

/** The Google Calendar access token held by this tab, or null; re-renders when it is granted or dropped. */
export function useCalendarToken(): string | null {
  return useSyncExternalStore(subscribeToCalendarToken, () => currentCalendarToken())
}

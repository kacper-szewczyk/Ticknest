import { useEffect, useState } from 'react'
import {
  EMPTY_CALENDAR_PREFERENCES,
  subscribeToCalendarPreferences,
  type CalendarPreferences,
} from './lib/calendarPreferences'
import { isGoogleCalendarAvailable } from './lib/googleCalendarConfig'

/**
 * Follows the member's calendar settings for the workspace. Returns undefined while loading, and the empty settings
 * when the feature is unavailable, so nothing is read from Firestore then.
 */
export function useCalendarPreferences(workspaceId: string, uid: string): CalendarPreferences | undefined {
  const isAvailable = isGoogleCalendarAvailable()
  const key = `${workspaceId}/${uid}`
  const [state, setState] = useState<{ key: string; preferences: CalendarPreferences } | null>(null)
  useEffect(() => {
    if (!isAvailable) return
    return subscribeToCalendarPreferences(
      workspaceId,
      uid,
      (preferences) => setState({ key: `${workspaceId}/${uid}`, preferences }),
      (error) => {
        console.error('Could not load the calendar settings.', 'code' in error ? error.code : error.name)
        setState({ key: `${workspaceId}/${uid}`, preferences: EMPTY_CALENDAR_PREFERENCES })
      },
    )
  }, [isAvailable, workspaceId, uid])
  if (!isAvailable) return EMPTY_CALENDAR_PREFERENCES
  return state?.key === key ? state.preferences : undefined
}

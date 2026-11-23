import { i18n } from '../i18n'
import { readableError } from './errors'
import { CalendarError } from './googleCalendar'

/** A message for the user in the active language for a failed calendar connection or request. */
export function calendarErrorMessage(error: unknown): string {
  if (!(error instanceof CalendarError)) return readableError(error)
  const { t } = i18n
  if (error.code === 'popup-closed') return t('calendar.errors.popupClosed')
  if (error.code === 'scope-denied') return t('calendar.errors.scopeDenied')
  if (error.code === 'auth-expired') return t('calendar.errors.authExpired')
  if (error.code === 'unavailable') return t('calendar.errors.unavailable')
  return t('calendar.errors.requestFailed')
}

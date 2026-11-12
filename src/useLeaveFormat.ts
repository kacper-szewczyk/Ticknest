import type { TFunction } from 'i18next'
import { useAppLanguage, useTranslation } from './i18n'
import type { LeaveRequest, LeaveType } from './lib/leave'

/** The type's stored name, or the translated built-in name until the owner saves the type. */
export function leaveTypeName(type: LeaveType | undefined, t: TFunction): string {
  if (!type) return t('timeOff.unknownType')
  if (!type.isStored && type.id === 'holiday') return t('timeOff.builtIn.holiday')
  if (!type.isStored && type.id === 'sick') return t('timeOff.builtIn.sick')
  return type.name
}

/** "2.5 days" in the active language; `null` reads as unlimited. */
export function useFormatDays() {
  const { t } = useTranslation()
  const language = useAppLanguage()
  const number = new Intl.NumberFormat(language, { maximumFractionDigits: 1 })
  return (days: number | null) =>
    days === null ? t('timeOff.unlimited') : t('timeOff.days', { count: days, value: number.format(days) })
}

/** "16 Nov – 20 Nov 2026", with half days marked. Dates are calendar days, so they are formatted in UTC. */
export function useFormatLeaveRange() {
  const { t } = useTranslation()
  const language = useAppLanguage()
  const short = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const long = new Intl.DateTimeFormat(language, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
  const date = (day: string, format: Intl.DateTimeFormat) => format.format(new Date(`${day}T00:00:00Z`))
  return (request: Pick<LeaveRequest, 'startDate' | 'endDate' | 'startHalf' | 'endHalf'>) => {
    const end = date(request.endDate, long)
    const half = t('timeOff.halfDayShort')
    if (request.startDate === request.endDate) {
      return request.startHalf || request.endHalf ? `${end} (${half})` : end
    }
    const start = `${date(request.startDate, short)}${request.startHalf ? ` (${half})` : ''}`
    return `${start} – ${end}${request.endHalf ? ` (${half})` : ''}`
  }
}

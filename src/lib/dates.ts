// Local-day and duration helpers. Days are `YYYY-MM-DD` strings in the browser's time zone.

export function localDayString(date: Date): string {
  const year = date.getFullYear()
  const month = (date.getMonth() + 1).toString().padStart(2, '0')
  const day = date.getDate().toString().padStart(2, '0')
  return `${year}-${month}-${day}`
}

/** Returns the start and the exclusive end of a local day, which is 23 or 25 hours long on DST changes. */
export function localDayBounds(day: string): [Date, Date] {
  const [year, month, date] = day.split('-').map(Number)
  const start = new Date(year, month - 1, date)
  const end = new Date(year, month - 1, date + 1)
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new Error('Choose a valid date.')
  return [start, end]
}

// Noon keeps day arithmetic away from DST transitions, which happen at night.
export function startOfWeekString(day: string, weekStartsOn: number): string {
  const date = new Date(`${day}T12:00:00`)
  const offset = (date.getDay() - weekStartsOn + 7) % 7
  date.setDate(date.getDate() - offset)
  return localDayString(date)
}

export function shiftDayString(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00`)
  date.setDate(date.getDate() + days)
  return localDayString(date)
}

export function formatWeekLabel(startDay: string): string {
  const start = new Date(`${startDay}T12:00:00`)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  if (sameMonth)
    return `${start.toLocaleDateString(undefined, { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

/** Formats a date for a `datetime-local` input in the browser's time zone. */
export function localDateTimeValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function dateTimeForDay(day: string, hour: number): string {
  return `${day}T${hour.toString().padStart(2, '0')}:00`
}

/** Formats seconds as `HH:MM:SS`; hours keep growing past 24. */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0')
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${hours}:${minutes}:${remainder}`
}

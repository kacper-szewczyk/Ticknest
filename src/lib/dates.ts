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

// Noon avoids DST transitions moving a calendar day across midnight.
export function dayDate(day: string): Date {
  return new Date(`${day}T12:00:00`)
}

export function startOfWeekString(day: string, weekStartsOn: number): string {
  const date = dayDate(day)
  const offset = (date.getDay() - weekStartsOn + 7) % 7
  date.setDate(date.getDate() - offset)
  return localDayString(date)
}

export function shiftDayString(day: string, days: number): string {
  const date = dayDate(day)
  date.setDate(date.getDate() + days)
  return localDayString(date)
}

export function formatWeekLabel(startDay: string): string {
  const start = dayDate(startDay)
  const end = new Date(start)
  end.setDate(end.getDate() + 6)
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear()
  if (sameMonth)
    return `${start.toLocaleDateString(undefined, { month: 'long' })} ${start.getDate()}–${end.getDate()}, ${end.getFullYear()}`
  const startLabel = start.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
  const endLabel = end.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startLabel} – ${endLabel}`
}

export function localDateTimeValue(date: Date): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 16)
}

export function dateTimeForDay(day: string, hour: number): string {
  return `${day}T${hour.toString().padStart(2, '0')}:00`
}

export function formatElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
    .toString()
    .padStart(2, '0')
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${hours}:${minutes}:${remainder}`
}

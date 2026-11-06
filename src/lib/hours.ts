/** How many digits the hours part may have: two for daily budget targets, four for project and task estimates. */
export type HoursInputOptions = { maxHourDigits?: number }

/** Estimates can run to `9999:59`, enough for a long project. */
export const ESTIMATE_HOURS: HoursInputOptions = { maxHourDigits: 4 }

/**
 * Parses an hours field into whole minutes. Accepts decimal hours (`7.5`, `7,5`) and `H:MM` (`7:30`); a blank
 * field is zero. Returns null when the text is neither, or has more hour digits than `maxHourDigits` (default 2).
 */
export function parseHoursInput(text: string, { maxHourDigits = 2 }: HoursInputOptions = {}): number | null {
  const value = text.trim()
  if (!value) return 0
  const hours = `\\d{1,${maxHourDigits}}`
  const clock = new RegExp(`^(${hours}):([0-5]\\d)$`).exec(value)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2])
  if (!new RegExp(`^(${hours}([.,]\\d*)?|[.,]\\d+)$`).test(value)) return null
  return Math.round(Number(value.replace(',', '.')) * 60)
}

/** Formats minutes as `H:MM`, the form the hours fields show after editing. Zero is blank. */
export function formatHoursInput(minutes: number): string {
  if (minutes <= 0) return ''
  return `${Math.floor(minutes / 60)}:${(minutes % 60).toString().padStart(2, '0')}`
}

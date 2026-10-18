import { describe, expect, it } from 'vitest'
import {
  dateTimeForDay,
  formatDuration,
  formatWeekLabel,
  localDateTimeValue,
  localDayBounds,
  localDayString,
  shiftDayString,
  startOfWeekString,
} from '../../src/lib/dates'

// vitest.config.ts runs these in Europe/Warsaw, which switches to summer time on 2026-03-29
// and back on 2026-10-25.
const HOUR = 60 * 60 * 1000

describe('localDayString', () => {
  it('formats the local calendar day with zero padding', () => {
    expect(localDayString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
  })

  it('uses the local day rather than the UTC day', () => {
    // 23:30 UTC on 31 December is already 1 January in Warsaw.
    expect(localDayString(new Date('2025-12-31T23:30:00Z'))).toBe('2026-01-01')
  })
})

describe('localDayBounds', () => {
  it('returns local midnight to the next local midnight', () => {
    const [start, end] = localDayBounds('2026-06-15')
    expect(start).toEqual(new Date(2026, 5, 15))
    expect(end).toEqual(new Date(2026, 5, 16))
    expect(end.getTime() - start.getTime()).toBe(24 * HOUR)
  })

  it('handles the short and long days of DST changes', () => {
    const [springStart, springEnd] = localDayBounds('2026-03-29')
    expect(springEnd.getTime() - springStart.getTime()).toBe(23 * HOUR)
    const [autumnStart, autumnEnd] = localDayBounds('2026-10-25')
    expect(autumnEnd.getTime() - autumnStart.getTime()).toBe(25 * HOUR)
  })

  it('rolls over month and year ends', () => {
    expect(localDayBounds('2026-12-31')[1]).toEqual(new Date(2027, 0, 1))
  })

  it('rejects text that is not a date', () => {
    expect(() => localDayBounds('not-a-day')).toThrow('Choose a valid date.')
    expect(() => localDayBounds('')).toThrow('Choose a valid date.')
  })
})

describe('startOfWeekString', () => {
  // 2026-10-14 is a Wednesday.
  it.each([
    [1, '2026-10-12'],
    [0, '2026-10-11'],
    [3, '2026-10-14'],
    [6, '2026-10-10'],
  ])('starts the week on day %i', (weekStartsOn, expected) => {
    expect(startOfWeekString('2026-10-14', weekStartsOn)).toBe(expected)
  })

  it('crosses month boundaries', () => {
    expect(startOfWeekString('2026-11-01', 1)).toBe('2026-10-26')
  })
})

describe('shiftDayString', () => {
  it('moves forward and back by whole days', () => {
    expect(shiftDayString('2026-10-14', 7)).toBe('2026-10-21')
    expect(shiftDayString('2026-03-01', -1)).toBe('2026-02-28')
    expect(shiftDayString('2024-02-28', 1)).toBe('2024-02-29')
  })

  it('stays on calendar days across DST changes', () => {
    expect(shiftDayString('2026-03-28', 1)).toBe('2026-03-29')
    expect(shiftDayString('2026-10-25', 1)).toBe('2026-10-26')
    expect(shiftDayString('2026-10-19', -7)).toBe('2026-10-12')
  })
})

describe('formatWeekLabel', () => {
  it('names the month once when the week stays in one month', () => {
    const month = new Date(2026, 9, 12).toLocaleDateString(undefined, { month: 'long' })
    expect(formatWeekLabel('2026-10-12')).toBe(`${month} 12–18, 2026`)
  })

  it('shows both ends when the week spans two months or years', () => {
    const label = formatWeekLabel('2026-12-28')
    const start = new Date(2026, 11, 28).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    const end = new Date(2027, 0, 3).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    expect(label).toBe(`${start} – ${end}`)
  })
})

describe('localDateTimeValue', () => {
  it('formats a datetime-local value in the local time zone', () => {
    expect(localDateTimeValue(new Date('2026-07-01T10:05:30Z'))).toBe('2026-07-01T12:05')
    expect(localDateTimeValue(new Date('2026-01-01T10:05:30Z'))).toBe('2026-01-01T11:05')
  })
})

describe('dateTimeForDay', () => {
  it('pads the hour', () => {
    expect(dateTimeForDay('2026-10-14', 9)).toBe('2026-10-14T09:00')
    expect(dateTimeForDay('2026-10-14', 17)).toBe('2026-10-14T17:00')
  })
})

describe('formatDuration', () => {
  it.each([
    [0, '00:00:00'],
    [59, '00:00:59'],
    [61, '00:01:01'],
    [3600, '01:00:00'],
    [36_000 + 1234, '10:20:34'],
    [100 * 3600, '100:00:00'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatDuration(seconds)).toBe(expected)
  })
})

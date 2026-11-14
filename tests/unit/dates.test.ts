import { describe, expect, it } from 'vitest'
import {
  dateTimeForDay,
  formatElapsed,
  formatWeekLabel,
  localDateTimeValue,
  localDayBounds,
  localDayString,
  localeWeekStart,
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
  // Intl puts thin spaces around the range dash in some languages; compare with plain spaces.
  const plain = (text: string) => text.replace(/[   ]/g, ' ')

  it('names the month once when the week stays in one month', () => {
    expect(plain(formatWeekLabel('2026-10-12', 'en'))).toBe('October 12 – 18, 2026')
    expect(plain(formatWeekLabel('2026-10-12', 'es'))).toBe('12–18 de octubre de 2026')
    expect(plain(formatWeekLabel('2026-10-12', 'pl'))).toBe('12–18 października 2026')
  })

  it('shows both ends when the week spans two months or years', () => {
    expect(plain(formatWeekLabel('2026-12-28', 'en'))).toBe('Dec 28, 2026 – Jan 3, 2027')
    expect(plain(formatWeekLabel('2026-12-28', 'pl'))).toBe('28 gru 2026–3 sty 2027')
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

describe('formatElapsed', () => {
  it.each([
    [0, '00:00:00'],
    [59, '00:00:59'],
    [61, '00:01:01'],
    [3600, '01:00:00'],
    [36_000 + 1234, '10:20:34'],
    [100 * 3600, '100:00:00'],
  ])('formats %i seconds as %s', (seconds, expected) => {
    expect(formatElapsed(seconds)).toBe(expected)
  })
})

describe('localeWeekStart', () => {
  it.each([
    ['en-US', 0],
    ['pl-PL', 1],
    ['en-GB', 1],
  ])('uses the week start of %s', (locale, expected) => {
    expect(localeWeekStart(locale)).toBe(expected)
  })

  it('falls back to Monday for locales whose week starts on Saturday', () => {
    expect(localeWeekStart('ar-EG')).toBe(1)
  })

  it('falls back to Monday for a locale it cannot parse', () => {
    expect(localeWeekStart('not a locale!')).toBe(1)
  })
})

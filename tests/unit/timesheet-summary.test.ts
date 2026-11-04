import { describe, expect, it } from 'vitest'
import {
  DAY_SECONDS,
  entrySeconds,
  formatHoursMinutes,
  isDayOverLimit,
  isWeekOverLimit,
  overlappingEntryIds,
  summarizeDay,
  type SummaryEntry,
} from '../../src/lib/timesheetSummary'

// vitest.config.ts runs these in Europe/Warsaw, which switches back from summer time on 2026-10-25.
const HOUR = 60 * 60 * 1000
const MINUTE = 60 * 1000

function at(day: string, time: string): number {
  return new Date(`${day}T${time}`).getTime()
}

function entry(overrides: Partial<SummaryEntry> & { start: number; end: number | null }): SummaryEntry {
  const { start, end, ...rest } = overrides
  return {
    id: `${start}-${end}`,
    userId: 'u1',
    clientName: null,
    projectName: null,
    billable: false,
    startAt: { toMillis: () => start },
    endAt: end === null ? null : { toMillis: () => end },
    ...rest,
  }
}

describe('entrySeconds', () => {
  it('measures finished entries and counts running ones up to now', () => {
    const start = at('2026-11-02', '09:00')
    expect(entrySeconds(entry({ start, end: start + 90 * MINUTE }), 0)).toBe(5400)
    expect(entrySeconds(entry({ start, end: null }), start + 30_500)).toBe(30)
  })

  it('never goes negative', () => {
    const start = at('2026-11-02', '09:00')
    expect(entrySeconds(entry({ start, end: null }), start - HOUR)).toBe(0)
  })
})

describe('summarizeDay', () => {
  const day = '2026-11-02'

  it('counts entries and totals billable time', () => {
    const summary = summarizeDay(
      [
        entry({ id: 'a', start: at(day, '09:00'), end: at(day, '11:00'), billable: true }),
        entry({ id: 'b', start: at(day, '12:00'), end: at(day, '12:30'), billable: true }),
        entry({ id: 'c', start: at(day, '13:00'), end: at(day, '14:00') }),
      ],
      0,
    )
    expect(summary).toMatchObject({ count: 3, totalSeconds: 3.5 * 3600, billableSeconds: 2.5 * 3600, isRunning: false })
  })

  it('groups by client and project, largest first, and counts the rest', () => {
    const summary = summarizeDay(
      [
        entry({ id: 'a', start: at(day, '09:00'), end: at(day, '11:00'), clientName: 'Acme', projectName: 'Website' }),
        entry({ id: 'b', start: at(day, '11:00'), end: at(day, '13:15'), clientName: 'Acme', projectName: 'Website' }),
        entry({ id: 'c', start: at(day, '14:00'), end: at(day, '15:10'), projectName: 'Internal' }),
        entry({ id: 'd', start: at(day, '16:00'), end: at(day, '16:20') }),
      ],
      0,
    )
    expect(summary.topGroups).toEqual([
      { label: 'Acme · Website', seconds: 4.25 * 3600 },
      { label: 'Internal', seconds: 70 * 60 },
    ])
    expect(summary.moreGroups).toBe(1)
  })

  it('labels entries with no client or project', () => {
    const summary = summarizeDay([entry({ start: at(day, '09:00'), end: at(day, '10:00') })], 0)
    expect(summary.topGroups).toEqual([{ label: 'No client or project', seconds: 3600 }])
    expect(summary.moreGroups).toBe(0)
  })

  it('flags a running entry and counts it up to now', () => {
    const summary = summarizeDay([entry({ start: at(day, '09:00'), end: null })], at(day, '10:00'))
    expect(summary.isRunning).toBe(true)
    expect(summary.totalSeconds).toBe(3600)
  })

  it('handles an empty day', () => {
    expect(summarizeDay([], 0)).toEqual({
      count: 0,
      totalSeconds: 0,
      billableSeconds: 0,
      isRunning: false,
      topGroups: [],
      moreGroups: 0,
    })
  })
})

describe('isDayOverLimit', () => {
  const day = '2026-11-02'

  it('warns when one person logs more than 24 hours in a day', () => {
    const entries = [
      entry({ id: 'a', start: at(day, '00:00'), end: at(day, '20:00') }),
      entry({ id: 'b', start: at(day, '08:00'), end: at(day, '13:00') }),
    ]
    expect(isDayOverLimit(entries, day, 0)).toBe(true)
  })

  it('does not warn at exactly 24 hours', () => {
    const entries = [
      entry({ id: 'a', start: at(day, '00:00'), end: at(day, '12:00') }),
      entry({ id: 'b', start: at(day, '12:00'), end: at('2026-11-03', '00:00') }),
    ]
    expect(isDayOverLimit(entries, day, 0)).toBe(false)
  })

  it('only counts the part of an entry inside the day', () => {
    // 30 hours from the evening before: 24 hours fall on the day itself, which is not over.
    const entries = [entry({ start: at('2026-11-01', '20:00'), end: at('2026-11-03', '02:00') })]
    expect(isDayOverLimit(entries, day, 0)).toBe(false)
    expect(isDayOverLimit(entries, '2026-11-01', 0)).toBe(false)
  })

  it('counts time spilling over midnight from the day before', () => {
    const entries = [
      entry({ id: 'a', start: at('2026-11-01', '22:00'), end: at(day, '06:00') }),
      entry({ id: 'b', start: at(day, '05:00'), end: at(day, '23:30') }),
    ]
    expect(isDayOverLimit(entries, day, 0)).toBe(true)
  })

  it('counts people apart', () => {
    const entries = [
      entry({ id: 'a', userId: 'u1', start: at(day, '00:00'), end: at(day, '20:00') }),
      entry({ id: 'b', userId: 'u2', start: at(day, '00:00'), end: at(day, '20:00') }),
    ]
    expect(isDayOverLimit(entries, day, 0)).toBe(false)
  })

  it('counts a running entry up to now', () => {
    const entries = [
      entry({ id: 'a', start: at(day, '00:00'), end: at(day, '20:00') }),
      entry({ id: 'b', start: at(day, '06:00'), end: null }),
    ]
    expect(isDayOverLimit(entries, day, at(day, '08:00'))).toBe(false)
    expect(isDayOverLimit(entries, day, at(day, '12:00'))).toBe(true)
  })

  it('uses 24 hours on the 25-hour day when summer time ends', () => {
    const entries = [entry({ start: at('2026-10-25', '00:00'), end: at('2026-10-25', '23:30') })]
    expect(entrySeconds(entries[0], 0)).toBeGreaterThan(DAY_SECONDS)
    expect(isDayOverLimit(entries, '2026-10-25', 0)).toBe(true)
  })
})

describe('isWeekOverLimit', () => {
  const weekStart = '2026-11-02'

  it('warns when one person logs more than 24 hours for every day of the week', () => {
    const fullWeek = entry({ id: 'a', start: at(weekStart, '00:00'), end: at('2026-11-09', '00:00') })
    expect(isWeekOverLimit([fullWeek], weekStart, 7, 0)).toBe(false)
    const extra = entry({ id: 'b', start: at(weekStart, '09:00'), end: at(weekStart, '10:00') })
    expect(isWeekOverLimit([fullWeek, extra], weekStart, 7, 0)).toBe(true)
  })

  it('counts people apart', () => {
    const entries = ['u1', 'u2'].map((userId) =>
      entry({ id: userId, userId, start: at(weekStart, '00:00'), end: at('2026-11-08', '00:00') }),
    )
    expect(isWeekOverLimit(entries, weekStart, 7, 0)).toBe(false)
  })
})

describe('overlappingEntryIds', () => {
  const day = '2026-11-02'

  it('finds entries of one person that overlap', () => {
    const entries = [
      entry({ id: 'a', start: at(day, '09:00'), end: at(day, '17:00') }),
      entry({ id: 'b', start: at(day, '10:00'), end: at(day, '11:00') }),
      entry({ id: 'c', start: at(day, '13:00'), end: at(day, '14:00') }),
      entry({ id: 'd', start: at(day, '18:00'), end: at(day, '19:00') }),
    ]
    expect([...overlappingEntryIds(entries, 0)].sort()).toEqual(['a', 'b', 'c'])
  })

  it('does not treat entries that only touch as overlapping', () => {
    const entries = [
      entry({ id: 'a', start: at(day, '09:00'), end: at(day, '10:00') }),
      entry({ id: 'b', start: at(day, '10:00'), end: at(day, '11:00') }),
    ]
    expect(overlappingEntryIds(entries, 0).size).toBe(0)
  })

  it('ignores overlaps between different people', () => {
    const entries = [
      entry({ id: 'a', userId: 'u1', start: at(day, '09:00'), end: at(day, '10:00') }),
      entry({ id: 'b', userId: 'u2', start: at(day, '09:30'), end: at(day, '10:30') }),
    ]
    expect(overlappingEntryIds(entries, 0).size).toBe(0)
  })

  it('treats a running entry as lasting until now', () => {
    const entries = [
      entry({ id: 'a', start: at(day, '09:00'), end: null }),
      entry({ id: 'b', start: at(day, '11:00'), end: at(day, '12:00') }),
    ]
    expect(overlappingEntryIds(entries, at(day, '10:00')).size).toBe(0)
    expect([...overlappingEntryIds(entries, at(day, '11:30'))].sort()).toEqual(['a', 'b'])
  })
})

describe('formatHoursMinutes', () => {
  it('formats hours without padding and minutes with it', () => {
    expect(formatHoursMinutes(0)).toBe('0:00')
    expect(formatHoursMinutes(4 * 3600 + 15 * 60 + 59)).toBe('4:15')
    expect(formatHoursMinutes(26 * 3600 + 5 * 60)).toBe('26:05')
  })
})

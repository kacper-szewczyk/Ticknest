import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { endOfZonedDay, resolveTimeZone } from '../../functions/src/timers/midnight'
import { autoStopNoticeEntry } from '../../src/lib/autoStopNotice'
import type { TimeEntry } from '../../src/lib/timeEntries'

const at = (iso: string) => new Date(iso).getTime()
const iso = (ms: number) => new Date(ms).toISOString()

describe('endOfZonedDay', () => {
  it('ends a timer at the next midnight in the time zone it started in', () => {
    // 09:00 in Warsaw (UTC+1 in winter); the day ends at 00:00 local, 23:00 UTC.
    expect(iso(endOfZonedDay(at('2026-01-06T08:00:00Z'), 'Europe/Warsaw'))).toBe('2026-01-06T23:00:00.000Z')
    expect(iso(endOfZonedDay(at('2026-01-06T08:00:00Z'), 'America/New_York'))).toBe('2026-01-07T05:00:00.000Z')
    expect(iso(endOfZonedDay(at('2026-01-06T08:00:00Z'), 'UTC'))).toBe('2026-01-07T00:00:00.000Z')
  })

  it('uses the local start day, not the UTC one', () => {
    // 23:30 UTC on 6 January is already 7 January in Tokyo, whose day ends at 15:00 UTC on 7 January.
    expect(iso(endOfZonedDay(at('2026-01-06T23:30:00Z'), 'Asia/Tokyo'))).toBe('2026-01-07T15:00:00.000Z')
  })

  it('stops a timer started a minute before midnight at that midnight', () => {
    expect(iso(endOfZonedDay(at('2026-01-06T22:59:00Z'), 'Europe/Warsaw'))).toBe('2026-01-06T23:00:00.000Z')
  })

  it('gives a timer started exactly at midnight the whole day', () => {
    expect(iso(endOfZonedDay(at('2026-01-06T23:00:00Z'), 'Europe/Warsaw'))).toBe('2026-01-07T23:00:00.000Z')
  })

  it('handles 23- and 25-hour days', () => {
    // Clocks go forward on 29 March 2026 and back on 25 October 2026 in Warsaw.
    const springStart = at('2026-03-28T23:00:00Z')
    const springEnd = endOfZonedDay(springStart, 'Europe/Warsaw')
    expect(iso(springEnd)).toBe('2026-03-29T22:00:00.000Z')
    expect((springEnd - springStart) / 3_600_000).toBe(23)

    const autumnStart = at('2026-10-24T22:00:00Z')
    const autumnEnd = endOfZonedDay(autumnStart, 'Europe/Warsaw')
    expect(iso(autumnEnd)).toBe('2026-10-25T23:00:00.000Z')
    expect((autumnEnd - autumnStart) / 3_600_000).toBe(25)
  })

  it('ends at the start of the next day when the clocks skip midnight', () => {
    // Chile moves its clocks from 00:00 to 01:00 on 6 September 2026, so that day starts at 01:00 (04:00 UTC).
    expect(iso(endOfZonedDay(at('2026-09-05T15:00:00Z'), 'America/Santiago'))).toBe('2026-09-06T04:00:00.000Z')
  })
})

describe('resolveTimeZone', () => {
  it('takes the first valid time zone and falls back to UTC', () => {
    expect(resolveTimeZone('Europe/Warsaw', 'Asia/Tokyo')).toBe('Europe/Warsaw')
    expect(resolveTimeZone(undefined, 'Asia/Tokyo')).toBe('Asia/Tokyo')
    expect(resolveTimeZone('Mars/Olympus', '', null)).toBe('UTC')
  })
})

function entry(id: string, overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id,
    userId: 'alice',
    description: 'Work',
    clientName: null,
    projectName: null,
    taskName: null,
    billable: false,
    startAt: Timestamp.fromMillis(0),
    endAt: Timestamp.fromMillis(1000),
    ...overrides,
  }
}

describe('autoStopNoticeEntry', () => {
  it('returns the latest entry when it was auto-stopped and not yet shown', () => {
    const latest = entry('latest', { autoStopped: true })
    expect(autoStopNoticeEntry([latest, entry('older')], null)).toBe(latest)
  })

  it('returns nothing once the notice was shown', () => {
    expect(autoStopNoticeEntry([entry('latest', { autoStopped: true })], 'latest')).toBeNull()
  })

  it('returns nothing when a newer timer was started since', () => {
    expect(autoStopNoticeEntry([entry('new', { endAt: null }), entry('old', { autoStopped: true })], null)).toBeNull()
  })

  it('returns nothing without entries or for a manually stopped entry', () => {
    expect(autoStopNoticeEntry([], null)).toBeNull()
    expect(autoStopNoticeEntry([entry('latest')], null)).toBeNull()
  })
})

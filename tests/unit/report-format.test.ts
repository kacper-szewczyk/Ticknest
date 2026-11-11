import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import {
  csvField,
  csvHeader,
  csvRow,
  localDate,
  localDateTime,
  matchesFilters,
  reportRange,
  reportUserName,
  searchReportEntries,
  UNKNOWN_USER,
  type ReportFilters,
} from '../../src/lib/reportFormat'
import type { TimeEntry } from '../../src/lib/timeEntries'

const NO_FILTERS: ReportFilters = {
  startDay: '2026-10-01',
  endDay: '2026-10-31',
  userId: '',
  clientId: '',
  projectId: '',
  taskId: '',
  billable: '',
}

function entry(overrides: Partial<TimeEntry> = {}): TimeEntry {
  return {
    id: 'entry-1',
    userId: 'alice',
    userDisplayName: 'Alice',
    description: 'Design review',
    clientName: 'Acme',
    projectName: 'Website',
    taskName: 'Review',
    clientId: 'client-1',
    projectId: 'project-1',
    taskId: 'task-1',
    billable: true,
    startAt: Timestamp.fromDate(new Date('2026-10-14T08:00:00Z')),
    endAt: Timestamp.fromDate(new Date('2026-10-14T09:30:15Z')),
    ...overrides,
  }
}

describe('searchReportEntries', () => {
  const design = entry()
  const standup = entry({ id: 'entry-2', description: 'Standup', clientName: null, projectName: null, taskName: null })

  it('returns every entry for a blank search', () => {
    expect(searchReportEntries([design, standup], '   ')).toEqual([design, standup])
  })

  it('matches description, client, project and task case-insensitively', () => {
    expect(searchReportEntries([design, standup], 'STANDUP')).toEqual([standup])
    expect(searchReportEntries([design, standup], 'acme')).toEqual([design])
    expect(searchReportEntries([design, standup], 'website')).toEqual([design])
    expect(searchReportEntries([design, standup], 'review')).toEqual([design])
  })

  it('requires every term to match somewhere', () => {
    expect(searchReportEntries([design, standup], 'acme review')).toEqual([design])
    expect(searchReportEntries([design, standup], 'acme standup')).toEqual([])
  })

  it('matches the user name only when a resolver is given', () => {
    expect(searchReportEntries([design], 'alice')).toEqual([])
    expect(searchReportEntries([design], 'alice', (item) => item.userDisplayName ?? '')).toEqual([design])
  })
})

describe('reportRange', () => {
  it('covers whole local days, including the last one', () => {
    const [start, end] = reportRange({ startDay: '2026-10-01', endDay: '2026-10-31' })
    expect(start).toEqual(new Date(2026, 9, 1))
    expect(end).toEqual(new Date(2026, 10, 1))
  })

  it('covers a single day', () => {
    const [start, end] = reportRange({ startDay: '2026-10-14', endDay: '2026-10-14' })
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000)
  })
})

describe('matchesFilters', () => {
  it('accepts every entry when no filters are set', () => {
    expect(matchesFilters(entry(), NO_FILTERS)).toBe(true)
    expect(matchesFilters(entry({ clientId: null, projectId: null, taskId: null }), NO_FILTERS)).toBe(true)
  })

  it.each([
    ['clientId', 'client-1', 'client-2'],
    ['projectId', 'project-1', 'project-2'],
    ['taskId', 'task-1', 'task-2'],
  ] as const)('filters by %s', (field, matching, other) => {
    expect(matchesFilters(entry(), { ...NO_FILTERS, [field]: matching })).toBe(true)
    expect(matchesFilters(entry(), { ...NO_FILTERS, [field]: other })).toBe(false)
    expect(matchesFilters(entry({ [field]: null }), { ...NO_FILTERS, [field]: matching })).toBe(false)
  })

  it('filters by billable status', () => {
    expect(matchesFilters(entry({ billable: true }), { ...NO_FILTERS, billable: 'yes' })).toBe(true)
    expect(matchesFilters(entry({ billable: true }), { ...NO_FILTERS, billable: 'no' })).toBe(false)
    expect(matchesFilters(entry({ billable: false }), { ...NO_FILTERS, billable: 'no' })).toBe(true)
    expect(matchesFilters(entry({ billable: false }), { ...NO_FILTERS, billable: 'yes' })).toBe(false)
  })

  it('requires every filter to match', () => {
    expect(matchesFilters(entry(), { ...NO_FILTERS, clientId: 'client-1', billable: 'no' })).toBe(false)
  })
})

describe('csvField', () => {
  it('leaves plain values unquoted', () => {
    expect(csvField('Design review')).toBe('Design review')
    expect(csvField(42)).toBe('42')
    expect(csvField(true)).toBe('true')
  })

  it('writes null and undefined as empty fields', () => {
    expect(csvField(null)).toBe('')
    expect(csvField(undefined)).toBe('')
  })

  it('quotes commas, quotes, and line breaks', () => {
    expect(csvField('a,b')).toBe('"a,b"')
    expect(csvField('say "hi"')).toBe('"say ""hi"""')
    expect(csvField('line\nbreak')).toBe('"line\nbreak"')
    expect(csvField('carriage\rreturn')).toBe('"carriage\rreturn"')
  })
})

describe('localDate and localDateTime', () => {
  const instant = new Date('2026-10-14T23:30:00Z')

  it('uses the report time zone rather than the machine time zone', () => {
    expect(localDate(instant, 'UTC')).toBe('2026-10-14')
    expect(localDate(instant, 'Asia/Tokyo')).toBe('2026-10-15')
    expect(localDate(instant, 'America/Los_Angeles')).toBe('2026-10-14')
  })

  it('formats a 24-hour local time with its zone', () => {
    expect(localDateTime(instant, 'UTC')).toBe('2026-10-14 23:30:00 UTC')
    expect(localDateTime(instant, 'Asia/Tokyo')).toMatch(/^2026-10-15 08:30:00 /)
  })
})

describe('csvHeader', () => {
  it('names the time zone in the start and end columns', () => {
    expect(csvHeader('Europe/Warsaw')).toBe(
      'Date,User,Description,Client,Project,Task,Start (Europe/Warsaw),End (Europe/Warsaw),Duration,Billable',
    )
  })
})

describe('reportUserName', () => {
  const members = [
    { uid: 'alice', displayName: 'Alice Smith', email: 'alice@example.com' },
    { uid: 'bob', displayName: '  ', email: 'bob@example.com' },
  ]

  it('prefers the member display name, then email', () => {
    expect(reportUserName(entry(), members)).toBe('Alice Smith')
    expect(reportUserName(entry({ userId: 'bob', userDisplayName: 'Bob' }), members)).toBe('bob@example.com')
  })

  it('falls back to the name snapshotted on the entry for users missing from the list', () => {
    expect(reportUserName(entry({ userId: 'carol', userDisplayName: 'Carol' }), members)).toBe('Carol')
  })

  it('never returns a raw user ID', () => {
    expect(reportUserName(entry({ userId: 'KXvfP50Tq', userDisplayName: undefined }), [])).toBe(UNKNOWN_USER)
    expect(reportUserName(entry({ userId: 'KXvfP50Tq', userDisplayName: 'KXvfP50Tq' }), [])).toBe(UNKNOWN_USER)
  })
})

describe('csvRow', () => {
  it('formats a completed entry', () => {
    const completed = entry()
    expect(csvRow({ ...completed, endAt: completed.endAt! }, 'UTC', 'Alice')).toBe(
      '2026-10-14,Alice,Design review,Acme,Website,Review,2026-10-14 08:00:00 UTC,2026-10-14 09:30:15 UTC,01:30:15,Yes',
    )
  })

  it('leaves missing names empty and escapes text', () => {
    const completed = entry({
      description: 'Fix "login", again',
      clientName: null,
      projectName: null,
      taskName: null,
      billable: false,
    })
    expect(csvRow({ ...completed, endAt: completed.endAt! }, 'UTC', UNKNOWN_USER)).toBe(
      '2026-10-14,Unknown user,"Fix ""login"", again",,,,2026-10-14 08:00:00 UTC,2026-10-14 09:30:15 UTC,01:30:15,No',
    )
  })

  it('never reports a negative duration', () => {
    const reversed = entry({ endAt: Timestamp.fromDate(new Date('2026-10-14T07:00:00Z')) })
    expect(csvRow({ ...reversed, endAt: reversed.endAt! }, 'UTC', 'Alice')).toContain(',00:00:00,')
  })
})

import { describe, expect, it } from 'vitest'
import {
  calendarSuggestions,
  fullLeaveDays,
  matchKeywordRule,
  workForSeries,
  type CalendarEvent,
  type SuggestionContext,
} from '../../src/lib/calendarSuggestions'
import { buildWorkOptions } from '../../src/lib/workOptions'

// Tests run in Europe/Warsaw (see vitest.config.ts); November is UTC+1.
function event(id: string, start: string, end: string, overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return { id, seriesId: null, title: `Event ${id}`, start: new Date(start), end: new Date(end), ...overrides }
}

function context(overrides: Partial<SuggestionContext> = {}): SuggestionContext {
  return {
    entries: [],
    dismissedEventIds: new Set(),
    timeOffDays: new Set(),
    seriesWork: {},
    now: new Date('2026-11-20T12:00:00+01:00'),
    ...overrides,
  }
}

describe('calendarSuggestions', () => {
  it('suggests ended events in start order with their local day and duration', () => {
    const suggestions = calendarSuggestions(
      [
        event('b', '2026-11-18T14:00:00+01:00', '2026-11-18T14:45:00+01:00'),
        event('a', '2026-11-17T09:00:00+01:00', '2026-11-17T10:30:00+01:00'),
      ],
      context(),
    )
    expect(suggestions.map((item) => [item.id, item.day, item.durationSeconds])).toEqual([
      ['a', '2026-11-17', 5400],
      ['b', '2026-11-18', 2700],
    ])
  })

  it('skips events that have not ended yet', () => {
    const suggestions = calendarSuggestions(
      [event('running', '2026-11-20T11:30:00+01:00', '2026-11-20T12:30:00+01:00')],
      context(),
    )
    expect(suggestions).toEqual([])
  })

  it('skips events that cross local midnight, since an entry sits on one day', () => {
    const suggestions = calendarSuggestions(
      [
        event('overnight', '2026-11-17T23:00:00+01:00', '2026-11-18T01:00:00+01:00'),
        event('until-midnight', '2026-11-17T23:00:00+01:00', '2026-11-18T00:00:00+01:00'),
      ],
      context(),
    )
    expect(suggestions.map((item) => item.id)).toEqual(['until-midnight'])
  })

  it('skips dismissed events and events on days off', () => {
    const suggestions = calendarSuggestions(
      [
        event('dismissed', '2026-11-17T09:00:00+01:00', '2026-11-17T10:00:00+01:00'),
        event('day-off', '2026-11-18T09:00:00+01:00', '2026-11-18T10:00:00+01:00'),
        event('kept', '2026-11-19T09:00:00+01:00', '2026-11-19T10:00:00+01:00'),
      ],
      context({ dismissedEventIds: new Set(['dismissed']), timeOffDays: new Set(['2026-11-18']) }),
    )
    expect(suggestions.map((item) => item.id)).toEqual(['kept'])
  })

  it('skips events overlapping an entry, including a running timer, but not ones that only touch it', () => {
    const suggestions = calendarSuggestions(
      [
        event('overlaps', '2026-11-17T09:30:00+01:00', '2026-11-17T10:30:00+01:00'),
        event('touches', '2026-11-17T10:00:00+01:00', '2026-11-17T11:00:00+01:00'),
        event('during-timer', '2026-11-20T10:00:00+01:00', '2026-11-20T11:00:00+01:00'),
      ],
      context({
        entries: [
          { startAt: new Date('2026-11-17T08:00:00+01:00'), endAt: new Date('2026-11-17T10:00:00+01:00') },
          { startAt: new Date('2026-11-20T10:30:00+01:00'), endAt: null },
        ],
      }),
    )
    expect(suggestions.map((item) => item.id)).toEqual(['touches'])
  })

  it('attaches the work remembered for a recurring event', () => {
    const [suggestion] = calendarSuggestions(
      [event('standup_1', '2026-11-17T09:00:00+01:00', '2026-11-17T09:15:00+01:00', { seriesId: 'standup' })],
      context({ seriesWork: { standup: { projectId: 'p1', taskId: null } } }),
    )
    expect(suggestion.work).toEqual({ projectId: 'p1', taskId: null })
  })

  it('drops repeated and zero-length events', () => {
    const suggestions = calendarSuggestions(
      [
        event('a', '2026-11-17T09:00:00+01:00', '2026-11-17T10:00:00+01:00'),
        event('a', '2026-11-17T09:00:00+01:00', '2026-11-17T10:00:00+01:00'),
        event('empty', '2026-11-17T11:00:00+01:00', '2026-11-17T11:00:00+01:00'),
      ],
      context(),
    )
    expect(suggestions.map((item) => item.id)).toEqual(['a'])
  })
})

describe('fullLeaveDays', () => {
  it('lists every day of a request, leaving out half days at either end', () => {
    const days = fullLeaveDays([
      { startDate: '2026-11-16', endDate: '2026-11-18', startHalf: true, endHalf: false },
      { startDate: '2026-11-20', endDate: '2026-11-20', startHalf: false, endHalf: false },
      { startDate: '2026-11-23', endDate: '2026-11-23', startHalf: false, endHalf: true },
    ])
    expect([...days]).toEqual(['2026-11-17', '2026-11-18', '2026-11-20'])
  })

  it('handles a range across the DST change', () => {
    const days = fullLeaveDays([{ startDate: '2026-10-24', endDate: '2026-10-26', startHalf: false, endHalf: false }])
    expect([...days]).toEqual(['2026-10-24', '2026-10-25', '2026-10-26'])
  })
})

describe('workForSeries', () => {
  const options = buildWorkOptions({
    clients: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [
      {
        id: 'p1',
        name: 'Website',
        clientId: 'c1',
        description: '',
        color: '#000',
        estimateMinutes: null,
        archived: false,
      },
      { id: 'p2', name: 'Old', clientId: 'c1', description: '', color: '#000', estimateMinutes: null, archived: true },
    ],
    tasks: [{ id: 't1', name: 'Meetings', projectId: 'p1', estimateMinutes: null, billable: true, archived: false }],
  })

  it('returns the remembered project and task with their names and billable default', () => {
    expect(workForSeries(options, { projectId: 'p1', taskId: 't1' })).toEqual({
      clientId: 'c1',
      clientName: 'Acme',
      projectId: 'p1',
      projectName: 'Website',
      taskId: 't1',
      taskName: 'Meetings',
      billable: true,
    })
  })

  it('ignores archived or unknown work', () => {
    expect(workForSeries(options, { projectId: 'p2', taskId: null })).toBeUndefined()
    expect(workForSeries(options, { projectId: 'p1', taskId: 'missing' })).toBeUndefined()
    expect(workForSeries(options, null)).toBeUndefined()
  })
})

describe('keyword rules', () => {
  const rules = [
    { keyword: 'standup', projectId: 'internal', taskId: 'meetings' },
    { keyword: 'Review', projectId: 'client', taskId: null },
  ]

  it('matches the first rule whose keyword the title contains, ignoring case', () => {
    expect(matchKeywordRule('Daily STANDUP', rules)?.projectId).toBe('internal')
    expect(matchKeywordRule('Design review + standup', rules)?.projectId).toBe('internal')
    expect(matchKeywordRule('Code review', rules)?.projectId).toBe('client')
    expect(matchKeywordRule('Lunch', rules)).toBeNull()
    expect(matchKeywordRule('', rules)).toBeNull()
  })

  it('pre-fills work from a keyword only when no recurring mapping exists', () => {
    const suggestions = calendarSuggestions(
      [
        event('a', '2026-11-17T09:00:00+01:00', '2026-11-17T09:15:00+01:00', { title: 'Standup', seriesId: 's1' }),
        event('b', '2026-11-17T10:00:00+01:00', '2026-11-17T10:15:00+01:00', { title: 'Standup', seriesId: 's2' }),
        event('c', '2026-11-17T11:00:00+01:00', '2026-11-17T11:15:00+01:00', { title: 'Lunch' }),
      ],
      context({ seriesWork: { s1: { projectId: 'remembered', taskId: null } }, keywordRules: rules }),
    )
    expect(suggestions.map((item) => item.work)).toEqual([
      { projectId: 'remembered', taskId: null },
      { projectId: 'internal', taskId: 'meetings' },
      null,
    ])
  })
})

describe('the same meeting in several calendars', () => {
  it('is suggested once, from the first calendar it appeared in', () => {
    const suggestions = calendarSuggestions(
      [
        event('primary-copy', '2026-11-17T09:00:00+01:00', '2026-11-17T10:00:00+01:00', { occurrenceKey: 'uid|1' }),
        event('team-copy', '2026-11-17T09:00:00+01:00', '2026-11-17T10:00:00+01:00', { occurrenceKey: 'uid|1' }),
        event('next-week', '2026-11-18T09:00:00+01:00', '2026-11-18T10:00:00+01:00', { occurrenceKey: 'uid|2' }),
      ],
      context(),
    )
    expect(suggestions.map((item) => item.id)).toEqual(['primary-copy', 'next-week'])
  })
})

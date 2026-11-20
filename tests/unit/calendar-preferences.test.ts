import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('../../src/lib/firebase', () => ({ db: {} }))

const {
  MAX_CALENDARS,
  MAX_DISMISSED_EVENTS,
  MAX_KEYWORD_RULES,
  MAX_SERIES_MAPPINGS,
  EMPTY_CALENDAR_PREFERENCES,
  parseCalendarPreferences,
  withDismissed,
  withKeywordRule,
  withSeriesWork,
} = await import('../../src/lib/calendarPreferences')
const { isGoogleCalendarAvailable } = await import('../../src/lib/googleCalendar')

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('parseCalendarPreferences', () => {
  it('reads a stored document', () => {
    expect(
      parseCalendarPreferences({
        connected: true,
        calendarIds: ['primary', 'team@example.com'],
        dismissedEventIds: ['a', 'b'],
        seriesWork: { s1: { projectId: 'p1', taskId: 't1' }, s2: { projectId: 'p2', taskId: null } },
        keywordRules: [{ keyword: 'standup', projectId: 'p1', taskId: 't1' }],
      }),
    ).toEqual({
      connected: true,
      calendarIds: ['primary', 'team@example.com'],
      dismissedEventIds: ['a', 'b'],
      seriesWork: { s1: { projectId: 'p1', taskId: 't1' }, s2: { projectId: 'p2', taskId: null } },
      keywordRules: [{ keyword: 'standup', projectId: 'p1', taskId: 't1' }],
    })
  })

  it('reads a document saved before calendars and keyword rules existed', () => {
    expect(parseCalendarPreferences({ connected: true, dismissedEventIds: [], seriesWork: {} })).toEqual({
      ...EMPTY_CALENDAR_PREFERENCES,
      connected: true,
    })
  })

  it('keeps calendars and keyword rules within their limits', () => {
    const parsed = parseCalendarPreferences({
      calendarIds: [...Array.from({ length: MAX_CALENDARS + 5 }, (_, index) => `c${index}`), 'c0'],
      keywordRules: Array.from({ length: MAX_KEYWORD_RULES + 5 }, (_, index) => ({
        keyword: `k${index}`,
        projectId: 'p',
        taskId: null,
      })),
    })
    expect(parsed.calendarIds).toHaveLength(MAX_CALENDARS)
    expect(parsed.keywordRules).toHaveLength(MAX_KEYWORD_RULES)
  })

  it('drops malformed values', () => {
    expect(
      parseCalendarPreferences({
        connected: 'yes',
        dismissedEventIds: ['a', 1, '', null],
        seriesWork: { s1: { projectId: 1 }, s2: { projectId: null, taskId: null }, s3: 'p', s4: { projectId: 'p4' } },
        calendarIds: ['ok', 3, ''],
        keywordRules: [
          { keyword: '  ', projectId: 'p', taskId: null },
          { keyword: 'x'.repeat(101), projectId: 'p', taskId: null },
          { keyword: 'no project', projectId: null, taskId: null },
          'standup',
          { keyword: '  daily   sync ', projectId: 'p', taskId: null },
        ],
      }),
    ).toEqual({
      connected: false,
      calendarIds: ['ok'],
      dismissedEventIds: ['a'],
      seriesWork: {},
      keywordRules: [{ keyword: 'daily sync', projectId: 'p', taskId: null }],
    })
    expect(parseCalendarPreferences(undefined)).toEqual(EMPTY_CALENDAR_PREFERENCES)
  })
})

describe('withDismissed', () => {
  it('appends new IDs once, moving a repeated one to the end', () => {
    expect(withDismissed(['a', 'b'], ['a', 'c'])).toEqual(['b', 'a', 'c'])
  })

  it('keeps only the most recent dismissals', () => {
    const current = Array.from({ length: MAX_DISMISSED_EVENTS }, (_, index) => `e${index}`)
    const next = withDismissed(current, ['new'])
    expect(next).toHaveLength(MAX_DISMISSED_EVENTS)
    expect(next[0]).toBe('e1')
    expect(next.at(-1)).toBe('new')
  })
})

describe('withKeywordRule', () => {
  it('adds a rule, replacing one with the same keyword in any case', () => {
    const current = [{ keyword: 'Standup', projectId: 'p1', taskId: null }]
    expect(withKeywordRule(current, { keyword: ' review ', projectId: 'p2', taskId: 't2' })).toEqual([
      { keyword: 'Standup', projectId: 'p1', taskId: null },
      { keyword: 'review', projectId: 'p2', taskId: 't2' },
    ])
    expect(withKeywordRule(current, { keyword: 'STANDUP', projectId: 'p3', taskId: null })).toEqual([
      { keyword: 'STANDUP', projectId: 'p3', taskId: null },
    ])
  })

  it('refuses an empty keyword, a missing project, or a full list', () => {
    expect(withKeywordRule([], { keyword: '  ', projectId: 'p', taskId: null })).toBeNull()
    expect(withKeywordRule([], { keyword: 'x', projectId: null, taskId: null })).toBeNull()
    const full = Array.from({ length: MAX_KEYWORD_RULES }, (_, index) => ({
      keyword: `k${index}`,
      projectId: 'p',
      taskId: null,
    }))
    expect(withKeywordRule(full, { keyword: 'new', projectId: 'p', taskId: null })).toBeNull()
    // Replacing an existing keyword still works when the list is full.
    expect(withKeywordRule(full, { keyword: 'K0', projectId: 'q', taskId: null })).toHaveLength(MAX_KEYWORD_RULES)
  })
})

describe('withSeriesWork', () => {
  it('adds or replaces the mapping for a series', () => {
    const current = { s1: { projectId: 'p1', taskId: null } }
    expect(withSeriesWork(current, 's1', { projectId: 'p2', taskId: 't2' })).toEqual({
      s1: { projectId: 'p2', taskId: 't2' },
    })
    expect(withSeriesWork(current, 's2', { projectId: 'p3', taskId: null })).toEqual({
      s1: { projectId: 'p1', taskId: null },
      s2: { projectId: 'p3', taskId: null },
    })
  })

  it('removes the mapping when no project was chosen, and stays within the cap', () => {
    expect(withSeriesWork({ s1: { projectId: 'p1', taskId: null } }, 's1', { projectId: null, taskId: null })).toEqual(
      {},
    )
    const full = Object.fromEntries(
      Array.from({ length: MAX_SERIES_MAPPINGS }, (_, index) => [`s${index}`, { projectId: 'p', taskId: null }]),
    )
    expect(Object.keys(withSeriesWork(full, 'new', { projectId: 'p', taskId: null }))).toHaveLength(MAX_SERIES_MAPPINGS)
  })
})

describe('isGoogleCalendarAvailable', () => {
  it('is hidden without an OAuth client ID', () => {
    vi.stubEnv('VITE_GOOGLE_CALENDAR_CLIENT_ID', '  ')
    expect(isGoogleCalendarAvailable()).toBe(false)
  })

  it('shows with a client ID outside demo mode', () => {
    vi.stubEnv('VITE_GOOGLE_CALENDAR_CLIENT_ID', 'client.apps.googleusercontent.com')
    vi.stubEnv('VITE_DEMO_MODE', 'false')
    expect(isGoogleCalendarAvailable()).toBe(true)
  })

  it('is always hidden in demo mode', () => {
    vi.stubEnv('VITE_GOOGLE_CALENDAR_CLIENT_ID', 'client.apps.googleusercontent.com')
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    expect(isGoogleCalendarAvailable()).toBe(false)
  })
})

import { describe, expect, it } from 'vitest'
import { groupByOptions, parseGroupBy, summarizeReport, type ReportGroup } from '../../src/lib/reportGroups'
import type { TimeEntry } from '../../src/lib/timeEntries'

function timestamp(value: Date) {
  return { toMillis: () => value.getTime(), toDate: () => new Date(value) } as TimeEntry['startAt']
}

let nextId = 0
function entry(overrides: Partial<TimeEntry> & { day?: number; minutes?: number }): TimeEntry {
  const { day = 9, minutes = 60, ...rest } = overrides
  const start = new Date(2026, 10, day, 9, 0)
  return {
    id: `e${(nextId += 1)}`,
    userId: 'u1',
    description: '',
    clientName: null,
    projectName: null,
    taskName: null,
    billable: false,
    startAt: timestamp(start),
    endAt: timestamp(new Date(start.getTime() + minutes * 60_000)),
    ...rest,
  }
}

const userName = (item: TimeEntry) => (item.userId === 'u1' ? 'Ada' : 'Ben')

const ENTRIES: TimeEntry[] = [
  entry({
    clientId: 'c1',
    clientName: 'Maple',
    projectId: 'p1',
    projectName: 'Portal',
    taskName: 'Design',
    minutes: 120,
    billable: true,
  }),
  entry({
    clientId: 'c1',
    clientName: 'Maple',
    projectId: 'p1',
    projectName: 'Portal',
    taskName: 'QA',
    minutes: 30,
    day: 7,
  }),
  entry({ clientId: 'c1', clientName: 'Maple', projectId: 'p2', projectName: 'Website', minutes: 60, userId: 'u2' }),
  entry({
    clientId: 'c2',
    clientName: 'Harbor',
    projectId: 'p3',
    projectName: 'Portal',
    minutes: 45,
    billable: true,
    day: 8,
  }),
  entry({ minutes: 15, day: 8 }),
]

const total = (groups: ReportGroup[]) => groups.reduce((sum, group) => sum + group.seconds, 0)

describe('summarizeReport', () => {
  it('builds client lanes with nested projects whose totals add up', () => {
    const lanes = summarizeReport(ENTRIES, 'client', userName)
    expect(lanes.map((lane) => [lane.label, lane.seconds, lane.billableSeconds, lane.count])).toEqual([
      ['Maple', 210 * 60, 120 * 60, 3],
      ['Harbor', 45 * 60, 45 * 60, 1],
      ['No client', 15 * 60, 0, 1],
    ])
    // Nested projects skip the client caption: the lane header already names the client.
    expect(lanes[0].children?.map((child) => [child.label, child.seconds, child.caption])).toEqual([
      ['Portal', 150 * 60, undefined],
      ['Website', 60 * 60, undefined],
    ])
    expect(total(lanes)).toBe(270 * 60)
    for (const lane of lanes) expect(total(lane.children ?? [])).toBe(lane.seconds)
  })

  it('keeps same-named projects of different clients apart and nests tasks under projects', () => {
    const lanes = summarizeReport(ENTRIES, 'project', userName)
    const portals = lanes.filter((lane) => lane.label === 'Portal')
    expect(portals.map((lane) => lane.caption)).toEqual(['Maple', 'Harbor'])
    expect(portals[0].children?.map((child) => [child.label, child.seconds])).toEqual([
      ['Design', 120 * 60],
      ['QA', 30 * 60],
    ])
    expect(lanes.at(-1)).toMatchObject({ label: 'No project', children: [{ label: 'No task' }] })
  })

  it('sorts days chronologically and keeps flat tabs without children', () => {
    const days = summarizeReport(ENTRIES, 'day', userName)
    expect(days.map((day) => day.label)).toEqual(['2026-11-07', '2026-11-08', '2026-11-09'])
    expect(days.every((day) => day.children === undefined)).toBe(true)
    expect(summarizeReport(ENTRIES, 'user', userName).map((group) => group.label)).toEqual(['Ada', 'Ben'])
  })
})

describe('group-by options', () => {
  it('offers the User tab to managers and owners only', () => {
    expect(groupByOptions(true).map((option) => option.value)).toContain('user')
    expect(groupByOptions(false).map((option) => option.value)).not.toContain('user')
  })

  it('falls back to Day for unknown or disallowed values from the URL', () => {
    expect(parseGroupBy('client', false)).toBe('client')
    expect(parseGroupBy('user', true)).toBe('user')
    expect(parseGroupBy('user', false)).toBe('day')
    expect(parseGroupBy('bogus', true)).toBe('day')
    expect(parseGroupBy(null, true)).toBe('day')
  })
})

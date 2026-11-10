import { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import { csvRow, type ReportFilters } from '../../src/lib/reportFormat'
import { summarizeReport } from '../../src/lib/reportGroups'
import {
  buildReportPdfModel,
  describeReportFilters,
  reportPdfFileName,
  type ReportPdfInput,
} from '../../src/lib/reportPdf'
import type { TimeEntry } from '../../src/lib/timeEntries'

const FILTERS: ReportFilters = {
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
    userId: 'uid-alice-1234567890',
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
    endAt: Timestamp.fromDate(new Date('2026-10-14T09:30:00Z')),
    ...overrides,
  }
}

const ENTRIES = [
  entry(),
  entry({
    id: 'entry-2',
    userId: 'uid-bob-0987654321',
    userDisplayName: 'Łukasz Wójcik',
    description: '',
    clientName: null,
    clientId: null,
    projectName: null,
    projectId: null,
    taskName: null,
    taskId: null,
    billable: false,
    startAt: Timestamp.fromDate(new Date('2026-10-13T22:30:00Z')),
    endAt: Timestamp.fromDate(new Date('2026-10-13T23:15:00Z')),
  }),
]

const userName = (item: TimeEntry) => item.userDisplayName ?? 'Unknown user'

function input(overrides: Partial<ReportPdfInput> = {}): ReportPdfInput {
  return {
    workspaceName: 'Northwind Studio',
    filters: FILTERS,
    filterLabels: [],
    timeZone: 'Europe/Warsaw',
    generatedAt: new Date('2026-11-10T13:05:00Z'),
    groupBy: 'project',
    groups: summarizeReport(ENTRIES, 'project', userName),
    entries: ENTRIES,
    userName,
    showUser: true,
    ...overrides,
  }
}

describe('reportPdfFileName', () => {
  it('follows the CSV naming convention', () => {
    expect(reportPdfFileName(FILTERS)).toBe('ticknest-report-2026-10-01-to-2026-10-31.pdf')
  })
})

describe('buildReportPdfModel', () => {
  it('builds the header with workspace, range, time zone, generated time and filters', () => {
    const model = buildReportPdfModel(input({ filterLabels: ['Client: Acme', 'Billable only'] }))
    expect(model.title).toBe('Northwind Studio')
    expect(model.subtitle).toBe('Time report · 2026-10-01 to 2026-10-31')
    expect(model.details).toEqual([
      'Time zone: Europe/Warsaw',
      'Generated: 2026-11-10 14:05:00 CET',
      'Filters: Client: Acme, Billable only',
    ])
    expect(buildReportPdfModel(input()).details[2]).toBe('Filters: None')
  })

  it('totals tracked and billable time', () => {
    expect(buildReportPdfModel(input()).totals).toEqual([
      ['Total tracked', '02:15:00'],
      ['Billable', '01:30:00'],
      ['Entries', '2'],
    ])
  })

  it('follows the selected grouping, with swimlane children nested under their lane', () => {
    const model = buildReportPdfModel(input())
    expect(model.summaryTitle).toBe('Summary by project')
    expect(model.summaryHead).toEqual(['Project', 'Entries', 'Billable', 'Total', 'Share'])
    expect(model.summaryBody).toEqual([
      { nested: false, cells: ['Website · Acme', '1', '01:30:00', '01:30:00', '67%'] },
      { nested: true, cells: ['Review', '1', '01:30:00', '01:30:00', '67%'] },
      { nested: false, cells: ['No project', '1', '00:00:00', '00:45:00', '33%'] },
      { nested: true, cells: ['No task', '1', '00:00:00', '00:45:00', '33%'] },
    ])
  })

  it('lists entries in the report time zone with the same dates and durations as the CSV', () => {
    const model = buildReportPdfModel(input())
    expect(model.entriesHead).toEqual([
      'Date',
      'User',
      'Description',
      'Client',
      'Project',
      'Task',
      'Start',
      'End',
      'Duration',
      'Billable',
    ])
    expect(model.entriesBody).toEqual([
      ['2026-10-14', 'Alice', 'Design review', 'Acme', 'Website', 'Review', '10:00', '11:30', '01:30:00', 'Yes'],
      // 22:30 UTC is already the next day in Warsaw.
      ['2026-10-14', 'Łukasz Wójcik', 'Untitled entry', '—', '—', '—', '00:30', '01:15', '00:45:00', 'No'],
    ])
    const csv = csvRow({ ...ENTRIES[0], endAt: ENTRIES[0].endAt! }, 'Europe/Warsaw', 'Alice').split(',')
    expect(csv[0]).toBe(model.entriesBody[0][0])
    expect(csv[8]).toBe(model.entriesBody[0][8])
  })

  it('names the end day when an entry runs past midnight', () => {
    const overnight = entry({
      startAt: Timestamp.fromDate(new Date('2026-10-14T21:00:00Z')),
      endAt: Timestamp.fromDate(new Date('2026-10-14T23:00:00Z')),
    })
    const model = buildReportPdfModel(input({ entries: [overnight], groups: [] }))
    expect(model.entriesBody[0].slice(6, 8)).toEqual(['23:00', '2026-10-15 01:00'])
  })

  it('drops the user column for regular members and never shows raw user IDs', () => {
    const model = buildReportPdfModel(input({ showUser: false }))
    expect(model.entriesHead).not.toContain('User')
    expect(model.entriesBody[0]).toHaveLength(9)
    expect(JSON.stringify(buildReportPdfModel(input()))).not.toMatch(/uid-/)
  })
})

describe('describeReportFilters', () => {
  const catalog = {
    clients: [{ id: 'client-1', name: 'Acme' }],
    projects: [{ id: 'project-1', name: 'Website' }],
    tasks: [],
  } as unknown as Catalog
  const members = [{ uid: 'uid-alice', displayName: 'Alice', email: 'alice@example.com' }]

  it('names every active filter without raw IDs', () => {
    expect(
      describeReportFilters(
        {
          ...FILTERS,
          userId: 'uid-alice',
          clientId: 'client-1',
          projectId: 'project-1',
          taskId: 'gone',
          billable: 'no',
        },
        catalog,
        members,
        true,
      ),
    ).toEqual(['Member: Alice', 'Client: Acme', 'Project: Website', 'Task: Unknown task', 'Non-billable only'])
  })

  it('skips the member filter for regular members', () => {
    expect(describeReportFilters({ ...FILTERS, userId: 'uid-alice' }, catalog, members, false)).toEqual([])
  })
})

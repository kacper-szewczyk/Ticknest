import { describe, expect, it } from 'vitest'
import {
  type ImportCatalog,
  detectDateOrder,
  findColumns,
  findOverlappingLines,
  parseCsv,
  parseDate,
  parseTime,
  planCatalog,
  readClockifyRows,
  zonedTimeToUtc,
} from '../../functions/src/import/clockifyCsv'

const HEADER =
  'Project,Client,Description,Task,User,Group,Email,Tags,Billable,Start Date,Start Time,End Date,End Time,Duration (h),Duration (decimal)'

describe('parseCsv', () => {
  it('reads quoted fields with commas, doubled quotes and line breaks', () => {
    const rows = parseCsv('a,b,c\r\n"x, y","say ""hi""","line\nbreak"\r\n')
    expect(rows).toEqual([
      ['a', 'b', 'c'],
      ['x, y', 'say "hi"', 'line\nbreak'],
    ])
  })

  it('drops a byte order mark and blank lines', () => {
    expect(parseCsv('﻿a,b\n\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('uses semicolons when the header has more of them than commas', () => {
    expect(parseCsv('Project;Email\n"A, B";x@example.com')).toEqual([
      ['Project', 'Email'],
      ['A, B', 'x@example.com'],
    ])
  })

  it('keeps a last row without a trailing newline', () => {
    expect(parseCsv('a\n1')).toEqual([['a'], ['1']])
  })
})

describe('findColumns', () => {
  it('finds the Clockify columns ignoring case and spaces', () => {
    const { columns, missing } = findColumns(parseCsv(HEADER.toUpperCase())[0]!)
    expect(missing).toEqual([])
    expect(columns.email).toBe(6)
    expect(columns.startDate).toBe(9)
    expect(columns.endTime).toBe(12)
  })

  it('names the required columns that are missing', () => {
    expect(findColumns(['Project', 'Start Date', 'Start Time']).missing).toEqual(['Email', 'End Date', 'End Time'])
  })
})

describe('dates and times', () => {
  it('detects the date order from values that can only be read one way', () => {
    expect(detectDateOrder(['01/02/2026', '23/06/2026'])).toBe('dmy')
    expect(detectDateOrder(['01/02/2026', '06/23/2026'])).toBe('mdy')
    expect(detectDateOrder(['2026-06-23'])).toBe('ymd')
    expect(detectDateOrder(['01/02/2026', '03/04/2026'])).toBeNull()
    expect(detectDateOrder(['23/06/2026', '06/23/2026'])).toBeNull()
  })

  it('parses dates in each order and rejects impossible ones', () => {
    expect(parseDate('23/06/2026', 'dmy')).toEqual({ year: 2026, month: 6, day: 23 })
    expect(parseDate('06/23/2026', 'mdy')).toEqual({ year: 2026, month: 6, day: 23 })
    expect(parseDate('2026-06-23', 'ymd')).toEqual({ year: 2026, month: 6, day: 23 })
    expect(parseDate('23.06.2026', 'dmy')).toEqual({ year: 2026, month: 6, day: 23 })
    expect(parseDate('31/02/2026', 'dmy')).toBeNull()
    expect(parseDate('29/02/2028', 'dmy')).toEqual({ year: 2028, month: 2, day: 29 })
    expect(parseDate('06/23/2026', 'dmy')).toBeNull()
    expect(parseDate('yesterday', 'dmy')).toBeNull()
  })

  it('parses 24-hour and 12-hour times', () => {
    expect(parseTime('09:05:07')).toEqual({ hour: 9, minute: 5, second: 7 })
    expect(parseTime('9:05')).toEqual({ hour: 9, minute: 5, second: 0 })
    expect(parseTime('12:00:00 AM')).toEqual({ hour: 0, minute: 0, second: 0 })
    expect(parseTime('12:30:00 PM')).toEqual({ hour: 12, minute: 30, second: 0 })
    expect(parseTime('01:15:00 pm')).toEqual({ hour: 13, minute: 15, second: 0 })
    expect(parseTime('24:00:00')).toBeNull()
    expect(parseTime('13:00 PM')).toBeNull()
  })

  it('converts wall-clock times in a zone to UTC, across daylight saving changes', () => {
    const date = (day: number, month = 6) => ({ year: 2026, month, day })
    const time = (hour: number) => ({ hour, minute: 0, second: 0 })
    expect(zonedTimeToUtc(date(23), time(10), 'Europe/Warsaw')).toBe(Date.UTC(2026, 5, 23, 8))
    expect(zonedTimeToUtc(date(15, 1), time(10), 'Europe/Warsaw')).toBe(Date.UTC(2026, 0, 15, 9))
    expect(zonedTimeToUtc(date(23), time(10), 'America/New_York')).toBe(Date.UTC(2026, 5, 23, 14))
    expect(zonedTimeToUtc(date(23), time(10), 'UTC')).toBe(Date.UTC(2026, 5, 23, 10))
    // Europe/Warsaw moves from +01:00 to +02:00 at 02:00 on 29 March 2026.
    expect(zonedTimeToUtc(date(29, 3), time(1), 'Europe/Warsaw')).toBe(Date.UTC(2026, 2, 29, 0))
    expect(zonedTimeToUtc(date(29, 3), time(4), 'Europe/Warsaw')).toBe(Date.UTC(2026, 2, 29, 2))
  })
})

function read(lines: string[], timeZone = 'UTC') {
  const [header, ...dataRows] = parseCsv([HEADER, ...lines].join('\n'))
  return readClockifyRows(dataRows, findColumns(header!).columns, { dateOrder: 'dmy', timeZone })
}

describe('readClockifyRows', () => {
  it('maps a Clockify row to an import row', () => {
    const { rows, problems } = read([
      'Website,Acme,Fix the header,Design,Ada Lovelace,,ADA@example.com,,Yes,23/06/2026,09:00:00,23/06/2026,10:30:00,01:30:00,1.50',
    ])
    expect(problems).toEqual([])
    expect(rows).toEqual([
      {
        line: 2,
        email: 'ada@example.com',
        userName: 'Ada Lovelace',
        clientName: 'Acme',
        projectName: 'Website',
        taskName: 'Design',
        description: 'Fix the header',
        billable: true,
        startAt: Date.UTC(2026, 5, 23, 9),
        endAt: Date.UTC(2026, 5, 23, 10, 30),
        shortened: false,
      },
    ])
  })

  it('reads times in the export time zone and keeps entries that cross midnight', () => {
    const { rows } = read(
      [',,Night shift,,Ada,,ada@example.com,,No,23/06/2026,22:00:00,24/06/2026,02:00:00,04:00:00,4.00'],
      'Europe/Warsaw',
    )
    expect(rows[0]).toMatchObject({
      clientName: null,
      projectName: null,
      taskName: null,
      billable: false,
      startAt: Date.UTC(2026, 5, 23, 20),
      endAt: Date.UTC(2026, 5, 24, 0),
    })
  })

  it('empties Clockify’s placeholder description and shortens text Ticknest cannot store', () => {
    const { rows } = read([
      `${'P'.repeat(130)},,(Without Description),,Ada,,ada@example.com,,No,23/06/2026,09:00,23/06/2026,10:00,,`,
    ])
    expect(rows[0]).toMatchObject({ description: '', shortened: true })
    expect(rows[0]!.projectName).toHaveLength(100)
  })

  it('reports rows that cannot be read, with their line and reason', () => {
    const { rows, problems } = read([
      'P,,ok,,Ada,,ada@example.com,,No,23/06/2026,09:00,23/06/2026,10:00,,',
      'P,,no email,,Ada,,,,No,23/06/2026,09:00,23/06/2026,10:00,,',
      'P,,bad date,,Ada,,ada@example.com,,No,06/23/2026,09:00,06/23/2026,10:00,,',
      'P,,bad time,,Ada,,ada@example.com,,No,23/06/2026,9am,23/06/2026,10:00,,',
      'P,,backwards,,Ada,,ada@example.com,,No,23/06/2026,10:00,23/06/2026,09:00,,',
      ',,task only,T,Ada,,ada@example.com,,No,23/06/2026,09:00,23/06/2026,10:00,,',
    ])
    expect(rows.map((row) => row.line)).toEqual([2])
    expect(problems).toEqual([
      { line: 3, reason: 'missingEmail' },
      { line: 4, reason: 'invalidDate' },
      { line: 5, reason: 'invalidTime' },
      { line: 6, reason: 'endNotAfterStart' },
      { line: 7, reason: 'taskWithoutProject' },
    ])
  })
})

describe('findOverlappingLines', () => {
  it('keeps the earliest row of a user and flags later overlapping ones', () => {
    const rows = [
      { line: 2, userId: 'a', startAt: 0, endAt: 60 },
      { line: 3, userId: 'a', startAt: 30, endAt: 90 },
      { line: 4, userId: 'a', startAt: 60, endAt: 120 },
      { line: 5, userId: 'b', startAt: 30, endAt: 90 },
    ]
    expect([...findOverlappingLines(rows)]).toEqual([3])
  })
})

describe('planCatalog', () => {
  const catalog: ImportCatalog = {
    clients: [{ id: 'c1', name: 'Acme', archived: false }],
    projects: [
      { id: 'p1', name: 'Website', clientId: 'c1', archived: true },
      { id: 'p2', name: 'Internal', clientId: null, archived: false },
    ],
    tasks: [{ id: 't1', name: 'Design', projectId: 'p1', archived: false }],
  }

  it('reuses existing items, archived ones included, matching names without case', () => {
    expect(
      planCatalog(catalog, [
        { clientName: 'acme', projectName: 'WEBSITE', taskName: 'design' },
        { clientName: null, projectName: 'Internal', taskName: null },
      ]),
    ).toEqual({ clients: [], projects: [], tasks: [] })
  })

  it('lists each missing client, project and task once', () => {
    expect(
      planCatalog(catalog, [
        { clientName: 'Globex', projectName: 'App', taskName: 'Build' },
        { clientName: 'Globex', projectName: 'App', taskName: 'Build' },
        { clientName: 'Acme', projectName: 'Internal', taskName: null },
        { clientName: null, projectName: 'Website', taskName: null },
      ]),
    ).toEqual({
      clients: ['Globex'],
      projects: [
        { name: 'App', clientName: 'Globex' },
        // A project matches only under the same client.
        { name: 'Internal', clientName: 'Acme' },
        { name: 'Website', clientName: null },
      ],
      tasks: [{ name: 'Build', projectName: 'App', clientName: 'Globex' }],
    })
  })
})

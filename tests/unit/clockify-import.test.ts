import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import type { WorkspaceMember } from '../../src/lib/workspaces'

const callFunction = vi.fn()
vi.mock('../../src/lib/firebase', () => ({ callFunction, db: {} }))

const { buildImportPlan, readClockifyFile, runImport } = await import('../../src/lib/clockifyImport')

const HEADER =
  'Project,Client,Description,Task,User,Group,Email,Tags,Billable,Start Date,Start Time,End Date,End Time,Duration (h),Duration (decimal)'
const EMPTY_CATALOG: Catalog = { clients: [], projects: [], tasks: [] }

function member(uid: string, email: string, status: WorkspaceMember['status'] = 'active'): WorkspaceMember {
  return { uid, email, displayName: uid, role: 'member', status, joinedAt: null }
}

function csv(...lines: string[]): string {
  return [HEADER, ...lines].join('\n')
}

function fileOf(text: string) {
  const result = readClockifyFile(text)
  if (!result.ok) throw new Error(result.error.kind)
  return result.file
}

const OPTIONS = { dateOrder: 'dmy', timeZone: 'UTC', unknownUsers: 'skip', importerUid: 'owner' } as const

describe('readClockifyFile', () => {
  it('rejects an empty file and one without the Clockify columns', () => {
    expect(readClockifyFile(HEADER)).toEqual({ ok: false, error: { kind: 'empty' } })
    expect(readClockifyFile('Name,When\nx,y')).toEqual({
      ok: false,
      error: { kind: 'missingColumns', columns: ['Email', 'Start Date', 'Start Time', 'End Date', 'End Time'] },
    })
  })

  it('detects the date order from the dates in the file', () => {
    const file = fileOf(csv('P,,a,,Ada,,ada@example.com,,No,23/06/2026,09:00,23/06/2026,10:00,,'))
    expect(file.detectedDateOrder).toBe('dmy')
  })
})

describe('buildImportPlan', () => {
  const file = fileOf(
    csv(
      'App,Globex,second,Build,Ada,,ada@example.com,,Yes,23/06/2026,11:00,23/06/2026,12:00,,',
      'App,Globex,first,,Ada,,ADA@example.com,,No,23/06/2026,09:00,23/06/2026,10:00,,',
      'App,Globex,overlap,,Ada,,ada@example.com,,No,23/06/2026,09:30,23/06/2026,10:30,,',
      'App,Globex,stranger,,Bob,,bob@example.com,,No,23/06/2026,09:00,23/06/2026,10:00,,',
      'App,Globex,gone,,Cy,,cy@example.com,,No,23/06/2026,09:00,23/06/2026,10:00,,',
      'App,Globex,bad,,Ada,,ada@example.com,,No,31/02/2026,09:00,31/02/2026,10:00,,',
    ),
  )
  const members = [member('ada', 'Ada@Example.com'), member('cy', 'cy@example.com', 'removed')]

  it('matches users by email, skips non-members, and orders rows by start', () => {
    const plan = buildImportPlan(file, members, EMPTY_CATALOG, OPTIONS)
    expect(plan.rows.map((row) => [row.line, row.userId])).toEqual([
      [3, 'ada'],
      [2, 'ada'],
    ])
    expect(plan.problems).toEqual([
      { line: 4, reason: 'overlapsFile' },
      { line: 5, reason: 'unknownUser' },
      { line: 6, reason: 'unknownUser' },
      { line: 7, reason: 'invalidDate' },
    ])
    expect(plan.users.map((user) => [user.email, user.member?.uid ?? null, user.rowCount])).toEqual([
      ['ada@example.com', 'ada', 3],
      ['bob@example.com', null, 1],
      ['cy@example.com', null, 1],
    ])
    expect(plan.totalSeconds).toBe(2 * 3600)
    expect(plan.catalog).toEqual({
      clients: ['Globex'],
      projects: [{ name: 'App', clientName: 'Globex' }],
      tasks: [{ name: 'Build', projectName: 'App', clientName: 'Globex' }],
    })
  })

  it('assigns rows of non-members to the importer when asked, checking overlaps against their own rows', () => {
    const plan = buildImportPlan(file, members, EMPTY_CATALOG, { ...OPTIONS, unknownUsers: 'assign-to-me' })
    expect(plan.rows.map((row) => [row.line, row.userId])).toEqual([
      [3, 'ada'],
      [5, 'owner'],
      [2, 'ada'],
    ])
    // Bob's and Cy's rows cover the same hour; both now belong to the importer, so the later line overlaps.
    expect(plan.problems).toContainEqual({ line: 6, reason: 'overlapsFile' })
  })
})

describe('runImport', () => {
  beforeEach(() => callFunction.mockReset())

  function planOf(rowCount: number) {
    const lines = Array.from({ length: rowCount }, (_, index) => {
      const day = String((index % 28) + 1).padStart(2, '0')
      const month = String(Math.floor(index / 28) + 1).padStart(2, '0')
      return `P,,row ${index},,Ada,,ada@example.com,,No,${day}/${month}/2026,09:00,${day}/${month}/2026,10:00,,`
    })
    return buildImportPlan(fileOf(csv(...lines)), [member('ada', 'ada@example.com')], EMPTY_CATALOG, OPTIONS)
  }

  it('sends rows in chunks and combines the results', async () => {
    callFunction.mockImplementation(async (_name: string, data?: { rows: Array<{ line: number }> }) => {
      const rows = data?.rows ?? []
      return {
        results: rows.map(({ line }) =>
          line === 2 ? { line, status: 'skipped', reason: 'overlapsExisting' } : { line, status: 'imported' },
        ),
        created: { clients: 0, projects: rows[0]?.line === 2 ? 1 : 0, tasks: 0 },
      }
    })
    const progress: number[] = []
    const { report, error } = await runImport('ws', planOf(250), (sent) => progress.push(sent))

    expect(error).toBeNull()
    expect(callFunction).toHaveBeenCalledTimes(2)
    expect(callFunction.mock.calls[0]![0]).toBe('importTimeEntries')
    expect(callFunction.mock.calls[0]![1].rows).toHaveLength(200)
    expect(callFunction.mock.calls[0]![1].rows[0]).toEqual({
      line: 2,
      userId: 'ada',
      clientName: null,
      projectName: 'P',
      taskName: null,
      description: 'row 0',
      billable: false,
      startAt: Date.UTC(2026, 0, 1, 9),
      endAt: Date.UTC(2026, 0, 1, 10),
    })
    expect(progress).toEqual([200, 250])
    expect(report).toEqual({
      importedCount: 249,
      importedSeconds: 249 * 3600,
      skipped: [{ line: 2, reason: 'overlapsExisting' }],
      created: { clients: 0, projects: 1, tasks: 0 },
      notSentCount: 0,
    })
  })

  it('stops at the first failed call and reports what was not sent', async () => {
    const failure = new Error('offline')
    callFunction
      .mockResolvedValueOnce({ results: [], created: { clients: 0, projects: 0, tasks: 0 } })
      .mockRejectedValueOnce(failure)
    const { report, error } = await runImport('ws', planOf(250), () => {})
    expect(error).toBe(failure)
    expect(report.notSentCount).toBe(50)
  })
})

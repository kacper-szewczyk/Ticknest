import { describe, expect, it } from 'vitest'
import { DEMO_ACCOUNTS, DEMO_INVITEE_EMAIL } from '../../functions/src/demo/accounts'
import { buildDemoData, SERVER_TIMESTAMP, type DemoDocument } from '../../functions/src/demo/seed'
import { budgetPhase } from '../../src/lib/budgetForm'
import { calculateBudgetProgress, groupBudgets, zonedDayString } from '../../src/lib/budgetProgress'
import type { Budget } from '../../src/lib/budgets'
import { calendarDayMillis, MAX_BUDGET_DAYS, WEEKDAYS } from '../../src/lib/budgetValidation'
import { allowanceDocumentId, canDecideLeave, countLeaveDays, type LeaveRequest } from '../../src/lib/leave'
import { teamBudgetStatus } from '../../src/lib/teamBudgets'

const NOW = new Date('2026-11-04T02:00:00Z')
const DAY_MS = 24 * 60 * 60 * 1000
const data = buildDemoData(NOW)
const workspacePath = `workspaces/${data.workspaceId}`

function collection(name: string): DemoDocument[] {
  return data.documents.filter((document) => document.path.startsWith(`${workspacePath}/${name}/`))
}

function docId(document: DemoDocument): string {
  return document.path.split('/').at(-1)!
}

function localParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'short',
    hour: 'numeric',
  }).formatToParts(date)
  return {
    weekday: parts.find((part) => part.type === 'weekday')!.value,
    hour: Number(parts.find((part) => part.type === 'hour')!.value),
  }
}

const entries = collection('timeEntries')

describe('buildDemoData', () => {
  it('is deterministic for a given now', () => {
    expect(buildDemoData(new Date(NOW))).toEqual(data)
  })

  it('includes an owner, a manager, and members', () => {
    expect(DEMO_ACCOUNTS.filter((account) => account.role === 'owner')).toHaveLength(1)
    expect(DEMO_ACCOUNTS.some((account) => account.role === 'manager')).toBe(true)
    expect(DEMO_ACCOUNTS.filter((account) => account.role === 'member').length).toBeGreaterThanOrEqual(2)
  })

  it('creates one verified Auth user per demo account', () => {
    expect(data.users.map((user) => user.email)).toEqual(DEMO_ACCOUNTS.map((account) => account.email))
    for (const user of data.users) {
      expect(user.emailVerified).toBe(true)
      expect(user.password.length).toBeGreaterThanOrEqual(6)
    }
    expect(new Set(data.users.map((user) => user.uid)).size).toBe(data.users.length)
  })

  it('writes unique document paths with IDs the callables accept', () => {
    const paths = data.documents.map((document) => document.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) {
      for (const segment of path.split('/')) expect(segment).toMatch(/^[A-Za-z0-9_-]+$/)
    }
  })

  it('adds a profile and an active membership for every account', () => {
    const workspace = data.documents.find((document) => document.path === workspacePath)!
    const owner = data.users[DEMO_ACCOUNTS.findIndex((account) => account.role === 'owner')]
    expect(Object.keys(workspace.data).sort()).toEqual(['createdAt', 'name', 'ownerUid', 'updatedAt', 'weekStartsOn'])
    expect(workspace.data.ownerUid).toBe(owner.uid)

    data.users.forEach((user, index) => {
      const profile = data.documents.find((document) => document.path === `users/${user.uid}`)!
      expect(profile.data).toEqual({
        displayName: user.displayName,
        email: user.email,
        timezone: DEMO_ACCOUNTS[index].timezone,
        createdAt: SERVER_TIMESTAMP,
        updatedAt: SERVER_TIMESTAMP,
      })
      const member = data.documents.find((document) => document.path === `${workspacePath}/members/${user.uid}`)!
      expect(member.data).toEqual({
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        role: DEMO_ACCOUNTS[index].role,
        status: 'active',
        timezone: DEMO_ACCOUNTS[index].timezone,
        joinedAt: SERVER_TIMESTAMP,
      })
    })
  })

  it('links projects to clients and tasks to projects with the stored field shapes', () => {
    const clientIds = new Set(collection('clients').map(docId))
    const projectIds = new Set(collection('projects').map(docId))
    expect(clientIds.size).toBeGreaterThanOrEqual(2)
    for (const client of collection('clients')) {
      expect(Object.keys(client.data).sort()).toEqual(['archived', 'createdAt', 'name', 'updatedAt'])
    }
    for (const project of collection('projects')) {
      expect(Object.keys(project.data).sort()).toEqual(
        ['archived', 'clientId', 'color', 'createdAt', 'description', 'estimateMinutes', 'name', 'updatedAt'].sort(),
      )
      expect(project.data.clientId === null || clientIds.has(project.data.clientId as string)).toBe(true)
      expect(project.data.color).toMatch(/^#[0-9a-f]{6}$/)
    }
    const tasks = collection('tasks')
    for (const task of tasks) {
      expect(Object.keys(task.data).sort()).toEqual(
        ['archived', 'billable', 'createdAt', 'estimateMinutes', 'name', 'projectId', 'updatedAt'].sort(),
      )
      expect(projectIds.has(task.data.projectId as string)).toBe(true)
    }
    expect(new Set(tasks.map((task) => task.data.billable))).toEqual(new Set([true, false]))
  })

  it('adds one pending invitation that expires after the reset', () => {
    const invitations = collection('invitations')
    expect(invitations).toHaveLength(1)
    const [invitation] = invitations
    expect(invitation.data).toMatchObject({ email: DEMO_INVITEE_EMAIL, role: 'member', status: 'pending' })
    expect(invitation.data.tokenHash).toMatch(/^[0-9a-f]{64}$/)
    expect((invitation.data.expiresAt as Date).getTime()).toBeGreaterThan(NOW.getTime() + DAY_MS)
  })

  it('spans about three months of entries ending by now', () => {
    const starts = entries.map((entry) => (entry.data.startAt as Date).getTime())
    const ends = entries.map((entry) => (entry.data.endAt as Date).getTime())
    const earliest = Math.min(...starts)
    expect(earliest).toBeGreaterThanOrEqual(NOW.getTime() - 93 * DAY_MS)
    expect(earliest).toBeLessThanOrEqual(NOW.getTime() - 85 * DAY_MS)
    expect(Math.max(...ends)).toBeLessThanOrEqual(NOW.getTime())
    // The last workday before the reset has entries.
    expect(Math.max(...ends)).toBeGreaterThan(NOW.getTime() - 2 * DAY_MS)
  })

  it('writes completed entries with the fields and snapshots the app writes', () => {
    const catalog = new Map(
      [...collection('clients'), ...collection('projects'), ...collection('tasks')].map((item) => [
        docId(item),
        item.data,
      ]),
    )
    const users = new Map(data.users.map((user) => [user.uid, user]))
    for (const entry of entries) {
      const { data: values } = entry
      expect(Object.keys(values).sort()).toEqual(
        [
          'billable',
          'clientId',
          'clientName',
          'createdAt',
          'description',
          'endAt',
          'projectId',
          'projectName',
          'startAt',
          'taskId',
          'taskName',
          'updatedAt',
          'userDisplayName',
          'userId',
        ].sort(),
      )
      expect(values.userDisplayName).toBe(users.get(values.userId as string)?.displayName)
      expect(typeof values.description).toBe('string')
      expect((values.description as string).length).toBeGreaterThan(0)
      expect(values.startAt).toBeInstanceOf(Date)
      expect(values.endAt).toBeInstanceOf(Date)
      expect((values.endAt as Date).getTime()).toBeGreaterThan((values.startAt as Date).getTime())
      expect(values.createdAt).toBe(SERVER_TIMESTAMP)
      expect(values.updatedAt).toBe(SERVER_TIMESTAMP)

      const project = catalog.get(values.projectId as string)!
      const task = catalog.get(values.taskId as string)!
      expect(values.projectName).toBe(project.name)
      expect(values.taskName).toBe(task.name)
      expect(task.projectId).toBe(values.projectId)
      expect(values.clientId).toBe(project.clientId)
      expect(values.clientName).toBe(values.clientId ? catalog.get(values.clientId as string)!.name : null)
      expect(values.billable).toBe(task.billable)
    }
    expect(new Set(entries.map((entry) => entry.data.billable))).toEqual(new Set([true, false]))
  })

  it('does not overlap entries for the same user', () => {
    for (const user of data.users) {
      const ranges = entries
        .filter((entry) => entry.data.userId === user.uid)
        .map((entry) => [(entry.data.startAt as Date).getTime(), (entry.data.endAt as Date).getTime()])
        .sort((a, b) => a[0] - b[0])
      expect(ranges.length).toBeGreaterThan(100)
      for (let index = 1; index < ranges.length; index += 1) {
        expect(ranges[index][0]).toBeGreaterThanOrEqual(ranges[index - 1][1])
      }
    }
  })

  it('places entries on weekdays during each user’s local working hours', () => {
    data.users.forEach((user, index) => {
      const { timezone } = DEMO_ACCOUNTS[index]
      for (const entry of entries.filter((item) => item.data.userId === user.uid)) {
        const start = localParts(entry.data.startAt as Date, timezone)
        const end = localParts(entry.data.endAt as Date, timezone)
        expect(['Sat', 'Sun']).not.toContain(start.weekday)
        expect(start.weekday).toBe(end.weekday)
        expect(start.hour).toBeGreaterThanOrEqual(8)
        expect(end.hour).toBeLessThanOrEqual(20)
      }
    })
  })

  it('cuts off entries that would end after now', () => {
    // Midday on a weekday: the morning is seeded, the afternoon is not.
    const midday = new Date('2026-11-04T11:00:00Z')
    const ends = buildDemoData(midday)
      .documents.filter((document) => document.path.includes('/timeEntries/'))
      .map((document) => (document.data.endAt as Date).getTime())
    expect(Math.max(...ends)).toBeLessThanOrEqual(midday.getTime())
  })

  describe('budgets', () => {
    const budgets: Budget[] = collection('budgets').map(
      (document) => ({ id: docId(document), ...document.data }) as Budget,
    )
    const timezoneOf = (userId: string) => DEMO_ACCOUNTS[data.users.findIndex((user) => user.uid === userId)].timezone
    const todayOf = (budget: Budget) => zonedDayString(NOW.getTime(), timezoneOf(budget.userId))

    it('gives every account an active budget', () => {
      for (const user of data.users) {
        expect(
          budgets.some((budget) => budget.userId === user.uid && budgetPhase(budget, todayOf(budget)) === 'active'),
        ).toBe(true)
      }
    })

    it('has results for every phase filter', () => {
      const phases = new Set(budgets.map((budget) => budgetPhase(budget, todayOf(budget))))
      expect(phases).toEqual(new Set(['active', 'upcoming', 'past', 'archived']))
    })

    it('writes the fields and snapshots saveBudget writes', () => {
      const owner = data.users[DEMO_ACCOUNTS.findIndex((account) => account.role === 'owner')]
      const members = new Map(data.users.map((user) => [user.uid, user]))
      const catalog = new Map([...collection('clients'), ...collection('projects')].map((item) => [docId(item), item]))
      const targetTypes = new Set<string>()
      for (const document of collection('budgets')) {
        expect(Object.keys(document.data).sort()).toEqual(
          [
            'archived',
            'createdAt',
            'createdBy',
            'endDay',
            'exceptions',
            'startDay',
            'target',
            'updatedAt',
            'userDisplayName',
            'userId',
            'weekdayMinutes',
          ].sort(),
        )
        const budget = budgets.find((item) => item.id === docId(document))!
        expect(budget.userDisplayName).toBe(members.get(budget.userId)?.displayName)
        expect(Object.keys(budget.target).sort()).toEqual(['id', 'name', 'type'])
        const target = catalog.get(budget.target.id)!
        expect(target.path).toContain(budget.target.type === 'project' ? '/projects/' : '/clients/')
        expect(budget.target.name).toBe(target.data.name)
        expect(typeof budget.archived).toBe('boolean')
        expect(budget.createdBy).toBe(owner.uid)
        expect(document.data.createdAt).toBe(SERVER_TIMESTAMP)
        expect(document.data.updatedAt).toBe(SERVER_TIMESTAMP)
        targetTypes.add(budget.target.type)
      }
      expect(targetTypes).toEqual(new Set(['project', 'client']))
    })

    it('follows the saveBudget validation rules', () => {
      for (const budget of budgets) {
        const start = calendarDayMillis(budget.startDay)!
        const end = calendarDayMillis(budget.endDay)!
        expect(start).not.toBeNull()
        expect(end).not.toBeNull()
        expect(end).toBeGreaterThanOrEqual(start)
        expect((end - start) / DAY_MS + 1).toBeLessThanOrEqual(MAX_BUDGET_DAYS)
        expect(Object.keys(budget.weekdayMinutes).sort()).toEqual([...WEEKDAYS].sort())
        for (const weekday of WEEKDAYS) {
          const minutes = budget.weekdayMinutes[weekday]
          expect(Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440).toBe(true)
        }
        expect(WEEKDAYS.some((weekday) => budget.weekdayMinutes[weekday] > 0)).toBe(true)
        expect(budget.exceptions).toEqual([...new Set(budget.exceptions)].sort())
        for (const exception of budget.exceptions) {
          expect(calendarDayMillis(exception)).not.toBeNull()
          expect(exception >= budget.startDay && exception <= budget.endDay).toBe(true)
        }
      }
      expect(budgets.some((budget) => budget.exceptions.length > 0)).toBe(true)
    })

    it('shows more than one status in budget progress', () => {
      const progressEntries = entries.map((entry) => ({
        userId: entry.data.userId as string,
        projectId: entry.data.projectId as string,
        clientId: entry.data.clientId as string | null,
        startAt: { toMillis: () => (entry.data.startAt as Date).getTime() },
        endAt: { toMillis: () => (entry.data.endAt as Date).getTime() },
      }))
      const statuses = groupBudgets(budgets)
        .filter((group) => group.some((budget) => budgetPhase(budget, todayOf(budget)) === 'active'))
        .map((group) =>
          teamBudgetStatus(calculateBudgetProgress(group, progressEntries, timezoneOf(group[0].userId), NOW)),
        )
      expect(new Set(statuses)).toEqual(new Set(['behind', 'over']))
    })
  })
  describe('time off', () => {
    const requests = collection('leaveRequests').map(
      (document) => ({ id: docId(document), ...document.data }) as unknown as LeaveRequest,
    )
    const members = data.users.map((user, index) => ({ uid: user.uid, role: DEMO_ACCOUNTS[index].role }))
    const timezoneOf = (uid: string) => DEMO_ACCOUNTS[data.users.findIndex((user) => user.uid === uid)].timezone

    it('writes the fields submitLeaveRequest writes', () => {
      for (const document of collection('leaveRequests')) {
        expect(Object.keys(document.data).sort()).toEqual(
          [
            'autoApproved',
            'autoApprovedReason',
            'cancelledAt',
            'cancelledBy',
            'createdAt',
            'days',
            'decidedAt',
            'decidedBy',
            'decisionNote',
            'endDate',
            'endHalf',
            'note',
            'overAllowance',
            'overAllowanceDays',
            'startDate',
            'startHalf',
            'status',
            'typeId',
            'uid',
            'updatedAt',
            'userDisplayName',
            'year',
          ].sort(),
        )
        expect(document.data.userDisplayName).toBe(
          data.users.find((user) => user.uid === document.data.uid)?.displayName,
        )
      }
    })

    it('gives every account holiday or sick leave, with every status and both types', () => {
      for (const user of data.users) expect(requests.some((request) => request.uid === user.uid)).toBe(true)
      expect(new Set(requests.map((request) => request.typeId))).toEqual(new Set(['holiday', 'sick']))
      expect(new Set(requests.map((request) => request.status))).toEqual(
        new Set(['approved', 'pending', 'rejected', 'cancelled']),
      )
      expect(requests.some((request) => request.startHalf || request.endHalf)).toBe(true)
      expect(requests.some((request) => request.status === 'approved' && request.startDate > '2026-11-04')).toBe(true)
      expect(requests.some((request) => request.status === 'approved' && request.endDate < '2026-11-04')).toBe(true)
    })

    it('follows the submitLeaveRequest rules', () => {
      for (const request of requests) {
        expect(request.startDate <= request.endDate).toBe(true)
        expect(request.startDate.slice(0, 4)).toBe(request.endDate.slice(0, 4))
        expect(request.year).toBe(Number(request.startDate.slice(0, 4)))
        const days = countLeaveDays(request)
        expect(days).toBe(request.days)
        expect(days).toBeGreaterThan(0)
        expect(request.overAllowance).toBe(request.overAllowanceDays > 0)
      }
      for (const user of data.users) {
        const active = requests
          .filter((request) => request.uid === user.uid && ['pending', 'approved'].includes(request.status))
          .sort((a, b) => a.startDate.localeCompare(b.startDate))
        for (let index = 1; index < active.length; index += 1) {
          expect(active[index].startDate > active[index - 1].endDate).toBe(true)
        }
      }
    })

    it('keeps requests within one year when the reset runs near the new year', () => {
      // Upcoming leave reaches up to seven weeks ahead, so these push ranges across the new year.
      for (const day of ['2026-11-20', '2026-12-01', '2026-12-08', '2026-12-17', '2026-12-26', '2026-12-31']) {
        const resetAt = new Date(`${day}T02:00:00Z`)
        for (const document of buildDemoData(resetAt).documents) {
          if (!document.path.includes('/leaveRequests/')) continue
          const request = document.data as unknown as LeaveRequest
          expect(request.startDate.slice(0, 4)).toBe(request.endDate.slice(0, 4))
          expect(countLeaveDays(request)).toBe(request.days)
          expect(request.days).toBeGreaterThan(0)
        }
      }
    })

    it('records decisions from an eligible approver in order, all before now', () => {
      for (const request of requests) {
        const createdAt = request.createdAt as unknown as Date
        expect(createdAt.getTime()).toBeLessThanOrEqual(NOW.getTime())
        expect(request.autoApproved).toBe(false)
        if (request.status === 'pending') {
          expect(request.decidedBy).toBeNull()
          expect(request.decidedAt).toBeNull()
        } else {
          const approver = members.find((member) => member.uid === request.decidedBy)
          expect(canDecideLeave(approver, request.uid)).toBe(true)
          const decidedAt = request.decidedAt as unknown as Date
          expect(decidedAt.getTime()).toBeGreaterThan(createdAt.getTime())
          expect(decidedAt.getTime()).toBeLessThanOrEqual(NOW.getTime())
        }
        if (request.status === 'cancelled') {
          expect(request.cancelledBy).toBe(request.uid)
          expect((request.cancelledAt as unknown as Date).getTime()).toBeLessThanOrEqual(NOW.getTime())
        } else {
          expect(request.cancelledBy).toBeNull()
          expect(request.cancelledAt).toBeNull()
        }
        if (request.status === 'rejected') expect(request.decisionNote.length).toBeGreaterThan(0)
      }
    })

    it('logs no time on full days of pending or approved leave', () => {
      for (const request of requests) {
        if (request.status !== 'approved' && request.status !== 'pending') continue
        const timezone = timezoneOf(request.uid)
        const userEntries = entries.filter((entry) => entry.data.userId === request.uid)
        const start = calendarDayMillis(request.startDate)!
        const end = calendarDayMillis(request.endDate)!
        for (let day = start; day <= end; day += DAY_MS) {
          const isHalf = (day === start && request.startHalf) || (day === end && request.endHalf)
          const date = new Date(day).toISOString().slice(0, 10)
          const logged = userEntries
            .filter((entry) => zonedDayString((entry.data.startAt as Date).getTime(), timezone) === date)
            .reduce(
              (sum, entry) => sum + ((entry.data.endAt as Date).getTime() - (entry.data.startAt as Date).getTime()),
              0,
            )
          expect(logged).toBeLessThanOrEqual(isHalf ? 4 * 60 * 60 * 1000 : 0)
        }
      }
    })

    it('writes allowances with the fields the leave callables write', () => {
      const allowances = collection('leaveAllowances')
      expect(allowances.length).toBeGreaterThan(0)
      for (const document of allowances) {
        expect(Object.keys(document.data).sort()).toEqual(
          ['adjustments', 'allowanceDays', 'createdAt', 'typeId', 'uid', 'updatedAt', 'updatedBy', 'year'].sort(),
        )
        const { uid, typeId, year } = document.data as { uid: string; typeId: string; year: number }
        expect(docId(document)).toBe(allowanceDocumentId(uid, typeId, year))
        for (const adjustment of document.data.adjustments as { days: number; by: string; at: Date }[]) {
          expect(
            canDecideLeave(
              members.find((member) => member.uid === adjustment.by),
              uid,
            ),
          ).toBe(true)
          expect(adjustment.at.getTime()).toBeLessThanOrEqual(NOW.getTime())
        }
      }
    })
  })
})

import { describe, expect, it } from 'vitest'
import { DEMO_ACCOUNTS, DEMO_INVITEE_EMAIL } from '../../functions/src/demo/accounts'
import { buildDemoData, SERVER_TIMESTAMP, type DemoDocument } from '../../functions/src/demo/seed'

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
})

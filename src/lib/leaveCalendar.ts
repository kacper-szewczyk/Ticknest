// Leave laid out on calendar days: the team calendar's rows and the leave that lowers budget targets.
import type { LeaveRequest } from './leave'

const DAY_MS = 24 * 60 * 60 * 1000

type LeaveRange = Pick<LeaveRequest, 'startDate' | 'endDate' | 'startHalf' | 'endHalf'>

function dayMillis(day: string): number {
  return Date.parse(`${day}T00:00:00Z`)
}

function dayString(millis: number): string {
  return new Date(millis).toISOString().slice(0, 10)
}

/** True on Saturday and Sunday, the days leave never uses. */
export function isWeekendDay(day: string): boolean {
  const weekday = new Date(dayMillis(day)).getUTCDay()
  return weekday === 0 || weekday === 6
}

/**
 * The share of a working day a request takes: 1, 0.5 on a half day, and 0 on weekends and days outside it.
 * Matches how the server counts the request's days.
 */
export function leaveDayFraction(request: LeaveRange, day: string): number {
  if (day < request.startDate || day > request.endDate || isWeekendDay(day)) return 0
  const isHalf = (day === request.startDate && request.startHalf) || (day === request.endDate && request.endHalf)
  return isHalf ? 0.5 : 1
}

/** Every calendar day from `startDate` to `endDate`, inclusive. */
export function daysBetween(startDate: string, endDate: string): string[] {
  const days: string[] = []
  for (let millis = dayMillis(startDate); millis <= dayMillis(endDate); millis += DAY_MS) days.push(dayString(millis))
  return days
}

/** Every day of a month (1–12) as `YYYY-MM-DD`. */
export function monthDays(year: number, month: number): string[] {
  const first = `${year}-${String(month).padStart(2, '0')}-01`
  const last = dayString(Date.UTC(year, month, 0))
  return daysBetween(first, last)
}

/**
 * A member's approved leave per working day, as the share of the day taken (at most 1). Budgets use it to lower
 * that day's target.
 */
export function approvedLeaveDays(requests: readonly LeaveRequest[], uid: string): Map<string, number> {
  const days = new Map<string, number>()
  for (const request of requests) {
    if (request.uid !== uid || request.status !== 'approved') continue
    for (const day of daysBetween(request.startDate, request.endDate)) {
      const fraction = leaveDayFraction(request, day)
      if (fraction > 0) days.set(day, Math.min(1, (days.get(day) ?? 0) + fraction))
    }
  }
  return days
}

export type CalendarLeave = {
  request: LeaveRequest
  /** 1 for a full day, 0.5 for a half day. */
  fraction: number
}

export type CalendarMember = { uid: string; name: string; removed: boolean }

export type CalendarRow = {
  member: CalendarMember
  /** One list per shown day: the member's leave on it, approved before pending. */
  cells: CalendarLeave[][]
}

export type TeamCalendar = {
  rows: CalendarRow[]
  /** How many shown members have leave (approved or pending) on each day. */
  onLeave: number[]
  /** The shown requests that touch the days, by start date. */
  requests: LeaveRequest[]
}

export type TeamCalendarFilters = { uid: string; typeId: string }

/**
 * Lays approved and pending leave out per member and day. Active members get a row even without leave, so gaps
 * are visible; removed members appear only while they have leave in the range.
 */
export function teamCalendar(
  requests: readonly LeaveRequest[],
  members: readonly CalendarMember[],
  days: readonly string[],
  filters: TeamCalendarFilters,
): TeamCalendar {
  const first = days[0]
  const last = days[days.length - 1]
  const shown = requests
    .filter(
      (request) =>
        (request.status === 'approved' || request.status === 'pending') &&
        (!filters.uid || request.uid === filters.uid) &&
        (!filters.typeId || request.typeId === filters.typeId) &&
        request.startDate <= last &&
        request.endDate >= first,
    )
    .sort((a, b) => a.startDate.localeCompare(b.startDate) || a.userDisplayName.localeCompare(b.userDisplayName))

  const byUid = new Map(members.map((member) => [member.uid, member]))
  const rowMembers = members.filter((member) => !member.removed && (!filters.uid || member.uid === filters.uid))
  for (const request of shown) {
    if (rowMembers.some((member) => member.uid === request.uid)) continue
    const known = byUid.get(request.uid)
    rowMembers.push(known ?? { uid: request.uid, name: request.userDisplayName, removed: true })
  }
  rowMembers.sort((a, b) => a.name.localeCompare(b.name))

  const statusOrder = (request: LeaveRequest) => (request.status === 'approved' ? 0 : 1)
  const rows = rowMembers.map((member): CalendarRow => {
    const own = shown.filter((request) => request.uid === member.uid)
    return {
      member,
      cells: days.map((day) =>
        own
          .map((request) => ({ request, fraction: leaveDayFraction(request, day) }))
          .filter((leave) => leave.fraction > 0)
          .sort((a, b) => statusOrder(a.request) - statusOrder(b.request)),
      ),
    }
  })
  const onLeave = days.map((_, index) => rows.filter((row) => row.cells[index].length > 0).length)
  return { rows, onLeave, requests: shown }
}

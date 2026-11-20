// A member's calendar-suggestion settings for one workspace: whether they connected a calendar, which calendars to
// read, which events they dismissed, the project chosen for each recurring event, and their keyword rules. No event
// titles or times are stored.
import { deleteDoc, doc, onSnapshot, serverTimestamp, setDoc, type Unsubscribe } from 'firebase/firestore'
import type { KeywordRule, SeriesWork } from './calendarSuggestions'
import { db } from './firebase'

/** Firestore rules enforce these caps too. The oldest dismissals and mappings make room for new ones. */
export const MAX_DISMISSED_EVENTS = 500
export const MAX_SERIES_MAPPINGS = 200
export const MAX_CALENDARS = 20
export const MAX_KEYWORD_RULES = 50
export const MAX_KEYWORD_LENGTH = 100
const MAX_ID_LENGTH = 1024

export type CalendarPreferences = {
  connected: boolean
  /** The calendars to suggest from; empty means the primary calendar only. */
  calendarIds: string[]
  /** Oldest first, so trimming keeps the most recent dismissals. */
  dismissedEventIds: string[]
  seriesWork: Record<string, SeriesWork>
  /** Checked in order when an event has no remembered recurring-event work. */
  keywordRules: KeywordRule[]
}

export const EMPTY_CALENDAR_PREFERENCES: CalendarPreferences = {
  connected: false,
  calendarIds: [],
  dismissedEventIds: [],
  seriesWork: {},
  keywordRules: [],
}

function preferencesRef(workspaceId: string, uid: string) {
  return doc(db, 'workspaces', workspaceId, 'calendarPreferences', uid)
}

const isId = (value: unknown): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH

const optionalId = (value: unknown): string | null | undefined =>
  value === null ? null : isId(value) ? value : undefined

function parseWork(value: unknown): SeriesWork | null {
  if (typeof value !== 'object' || value === null) return null
  const projectId = optionalId((value as Record<string, unknown>).projectId)
  const taskId = optionalId((value as Record<string, unknown>).taskId)
  if (projectId === undefined || taskId === undefined || !projectId) return null
  return { projectId, taskId }
}

/** A trimmed keyword that fits the limit, or an empty string when it does not. */
export function normalizeKeyword(keyword: string): string {
  const trimmed = keyword.trim().replace(/\s+/g, ' ')
  return trimmed.length <= MAX_KEYWORD_LENGTH ? trimmed : ''
}

function parseKeywordRules(value: unknown): KeywordRule[] {
  if (!Array.isArray(value)) return []
  const rules: KeywordRule[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const rawKeyword = (item as Record<string, unknown>).keyword
    const keyword = typeof rawKeyword === 'string' ? normalizeKeyword(rawKeyword) : ''
    const work = parseWork(item)
    if (keyword && work) rules.push({ keyword, ...work })
  }
  return rules.slice(0, MAX_KEYWORD_RULES)
}

/** Reads a stored document defensively: unknown or malformed values are dropped. */
export function parseCalendarPreferences(data: unknown): CalendarPreferences {
  if (typeof data !== 'object' || data === null) return EMPTY_CALENDAR_PREFERENCES
  const record = data as Record<string, unknown>
  const calendarIds = Array.isArray(record.calendarIds) ? [...new Set(record.calendarIds.filter(isId))] : []
  const dismissedEventIds = Array.isArray(record.dismissedEventIds) ? record.dismissedEventIds.filter(isId) : []
  const seriesWork: Record<string, SeriesWork> = {}
  if (typeof record.seriesWork === 'object' && record.seriesWork !== null && !Array.isArray(record.seriesWork)) {
    for (const [seriesId, value] of Object.entries(record.seriesWork as Record<string, unknown>)) {
      const work = parseWork(value)
      if (isId(seriesId) && work) seriesWork[seriesId] = work
    }
  }
  return {
    connected: record.connected === true,
    calendarIds: calendarIds.slice(0, MAX_CALENDARS),
    dismissedEventIds: dismissedEventIds.slice(-MAX_DISMISSED_EVENTS),
    seriesWork,
    keywordRules: parseKeywordRules(record.keywordRules),
  }
}

export function subscribeToCalendarPreferences(
  workspaceId: string,
  uid: string,
  onChange: (preferences: CalendarPreferences) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    preferencesRef(workspaceId, uid),
    (snapshot) => onChange(parseCalendarPreferences(snapshot.data())),
    onError,
  )
}

/** Adds dismissed events, dropping the oldest ones past the cap. */
export function withDismissed(current: readonly string[], eventIds: readonly string[]): string[] {
  const added = eventIds.filter(isId)
  const kept = current.filter((id) => !added.includes(id))
  return [...kept, ...added].slice(-MAX_DISMISSED_EVENTS)
}

/**
 * Remembers the work for a recurring event. Past the cap the first stored mappings are dropped; Firestore returns map
 * keys sorted, so that is by series ID rather than by age, which is acceptable for a cap this rarely reached.
 */
export function withSeriesWork(
  current: Readonly<Record<string, SeriesWork>>,
  seriesId: string,
  work: SeriesWork,
): Record<string, SeriesWork> {
  const entries = Object.entries(current).filter(([id]) => id !== seriesId)
  if (work.projectId && isId(seriesId)) entries.push([seriesId, { projectId: work.projectId, taskId: work.taskId }])
  return Object.fromEntries(entries.slice(-MAX_SERIES_MAPPINGS))
}

/**
 * Adds a keyword rule, replacing one with the same keyword (ignoring case). Returns null when the keyword is empty or
 * too long, there is no project, or the list is full.
 */
export function withKeywordRule(current: readonly KeywordRule[], rule: KeywordRule): KeywordRule[] | null {
  const keyword = normalizeKeyword(rule.keyword)
  if (!keyword || !rule.projectId) return null
  const lower = keyword.toLocaleLowerCase()
  const kept = current.filter((existing) => existing.keyword.toLocaleLowerCase() !== lower)
  if (kept.length >= MAX_KEYWORD_RULES) return null
  return [...kept, { keyword, projectId: rule.projectId, taskId: rule.taskId }]
}

export async function saveCalendarPreferences(
  workspaceId: string,
  uid: string,
  preferences: CalendarPreferences,
): Promise<void> {
  await setDoc(preferencesRef(workspaceId, uid), {
    connected: preferences.connected,
    calendarIds: preferences.calendarIds.slice(0, MAX_CALENDARS),
    dismissedEventIds: preferences.dismissedEventIds.slice(-MAX_DISMISSED_EVENTS),
    seriesWork: preferences.seriesWork,
    keywordRules: preferences.keywordRules
      .slice(0, MAX_KEYWORD_RULES)
      .map(({ keyword, projectId, taskId }) => ({ keyword, projectId, taskId })),
    updatedAt: serverTimestamp(),
  })
}

/** Forgets everything stored for the member's calendar in this workspace. */
export async function deleteCalendarPreferences(workspaceId: string, uid: string): Promise<void> {
  await deleteDoc(preferencesRef(workspaceId, uid))
}

// Google Calendar access from the browser. It uses the Google Identity Services token client, so Calendar data goes
// straight from Google to this browser: no Cloud Function sees it and no refresh token is stored anywhere. The access
// token lasts about an hour and is kept for this browser tab only; after that the user reconnects with one click.
import type { CalendarEvent } from './calendarSuggestions'
import {
  type CalendarListItem,
  GOOGLE_CALENDAR_LIST_FIELDS,
  GOOGLE_EVENT_FIELDS,
  parseGoogleCalendarListPage,
  parseGoogleEventsPage,
} from './googleCalendarEvents'
import { googleCalendarClientId, isGoogleCalendarAvailable } from './googleCalendarConfig'

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
/** Read-only access to events; Tickness never writes to the calendar. */
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
/** Read-only access to the list of the user's calendars, so they can choose which ones are suggested from. */
export const GOOGLE_CALENDAR_LIST_SCOPE = 'https://www.googleapis.com/auth/calendar.calendarlist.readonly'
const GOOGLE_SCOPES = [GOOGLE_CALENDAR_SCOPE, GOOGLE_CALENDAR_LIST_SCOPE] as const
/** The calendar read when the user has not chosen any. */
export const PRIMARY_CALENDAR_ID = 'primary'
const API_URL = 'https://www.googleapis.com/calendar/v3'
const eventsUrl = (calendarId: string) => `${API_URL}/calendars/${encodeURIComponent(calendarId)}/events`
const CALENDAR_LIST_URL = `${API_URL}/users/me/calendarList`
// Versioned because tokens granted before the calendar list scope was added cannot read the list.
const TOKEN_STORAGE_KEY = 'tickness.googleCalendarToken.v2'
// Treat the token as expired a minute early, so a request never starts with a token about to lapse.
const EXPIRY_MARGIN_MS = 60_000
const MAX_PAGES = 4

export type CalendarErrorCode = 'unavailable' | 'popup-closed' | 'scope-denied' | 'auth-expired' | 'request-failed'

export class CalendarError extends Error {
  readonly code: CalendarErrorCode
  constructor(code: CalendarErrorCode, message: string) {
    super(message)
    this.name = 'CalendarError'
    this.code = code
  }
}

export { googleCalendarClientId, isGoogleCalendarAvailable }

// ---- Minimal typing of the Google Identity Services token client. ----

type TokenResponse = { access_token?: string; expires_in?: number | string; error?: string; scope?: string }
type TokenClient = { requestAccessToken: (overrides?: { prompt?: string }) => void }
type GoogleOAuth2 = {
  initTokenClient: (config: {
    client_id: string
    scope: string
    include_granted_scopes?: boolean
    callback: (response: TokenResponse) => void
    error_callback?: (error: { type?: string }) => void
  }) => TokenClient
  hasGrantedAllScopes: (response: TokenResponse, ...scopes: string[]) => boolean
  revoke: (token: string, done?: () => void) => void
}

function googleOAuth2(): GoogleOAuth2 | undefined {
  const google = (window as { google?: { accounts?: { oauth2?: GoogleOAuth2 } } }).google
  return google?.accounts?.oauth2
}

let scriptPromise: Promise<GoogleOAuth2> | null = null

function loadIdentityServices(): Promise<GoogleOAuth2> {
  const loaded = googleOAuth2()
  if (loaded) return Promise.resolve(loaded)
  scriptPromise ??= new Promise<GoogleOAuth2>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = GIS_SCRIPT_URL
    script.async = true
    script.onload = () => {
      const oauth2 = googleOAuth2()
      if (oauth2) resolve(oauth2)
      else reject(new CalendarError('unavailable', 'Google Identity Services did not load.'))
    }
    script.onerror = () => {
      scriptPromise = null
      script.remove()
      reject(new CalendarError('unavailable', 'Google Identity Services could not be loaded.'))
    }
    document.head.appendChild(script)
  })
  return scriptPromise
}

/**
 * Starts loading Google Identity Services ahead of a click. The popup must open while the click still counts as
 * user activation, which an unloaded script would delay past in some browsers.
 */
export function preloadGoogleCalendar(): void {
  if (googleCalendarClientId()) loadIdentityServices().catch(() => undefined)
}

// ---- The access token for this tab. ----

type StoredToken = { accessToken: string; expiresAt: number }

let token: StoredToken | null = readStoredToken()
const listeners = new Set<() => void>()

function readStoredToken(): StoredToken | null {
  try {
    const raw = window.sessionStorage.getItem(TOKEN_STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'accessToken' in parsed &&
      'expiresAt' in parsed &&
      typeof parsed.accessToken === 'string' &&
      typeof parsed.expiresAt === 'number'
    ) {
      return { accessToken: parsed.accessToken, expiresAt: parsed.expiresAt }
    }
  } catch {
    // Storage may be blocked; the user then reconnects after a reload.
  }
  return null
}

function setToken(next: StoredToken | null) {
  token = next
  try {
    if (next) window.sessionStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify(next))
    else window.sessionStorage.removeItem(TOKEN_STORAGE_KEY)
  } catch {
    // Keeping the token in memory is enough for this page.
  }
  listeners.forEach((listener) => listener())
}

/** The current access token, or null when there is none or it has expired. */
export function currentCalendarToken(now = Date.now()): string | null {
  return token && token.expiresAt - EXPIRY_MARGIN_MS > now ? token.accessToken : null
}

/** Calls `listener` whenever the token is granted, expires on a request, or is revoked. */
export function subscribeToCalendarToken(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/**
 * Asks Google for read-only Calendar access in a popup. Must run from a click, or the browser blocks the popup.
 * `prompt: 'consent'` always shows the consent screen; the default skips it when access was granted before.
 */
export async function connectGoogleCalendar(prompt: '' | 'consent' = ''): Promise<void> {
  const clientId = googleCalendarClientId()
  if (!clientId) throw new CalendarError('unavailable', 'Google Calendar is not set up on this instance.')
  const oauth2 = await loadIdentityServices()
  await new Promise<void>((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES.join(' '),
      include_granted_scopes: false,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new CalendarError('scope-denied', 'Google Calendar access was not granted.'))
          return
        }
        if (!oauth2.hasGrantedAllScopes(response, ...GOOGLE_SCOPES)) {
          oauth2.revoke(response.access_token)
          reject(new CalendarError('scope-denied', 'Google Calendar access was not granted.'))
          return
        }
        const expiresIn = Number(response.expires_in)
        setToken({
          accessToken: response.access_token,
          expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
        })
        resolve()
      },
      error_callback: () => reject(new CalendarError('popup-closed', 'The Google sign-in window was closed.')),
    })
    client.requestAccessToken({ prompt })
  })
}

/** Revokes the grant with Google when this tab holds a token, and forgets the token either way. */
export async function disconnectGoogleCalendar(): Promise<boolean> {
  const accessToken = currentCalendarToken()
  setToken(null)
  if (!accessToken) return false
  try {
    const oauth2 = await loadIdentityServices()
    await new Promise<void>((resolve) => oauth2.revoke(accessToken, resolve))
    return true
  } catch {
    return false
  }
}

/** Thrown for a 404, so a calendar the user has since unsubscribed from can be skipped. */
class NotFoundError extends Error {}

async function getJson(url: string, accessToken: string): Promise<unknown> {
  let response: Response
  try {
    response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } })
  } catch {
    throw new CalendarError('request-failed', 'Google Calendar could not be reached.')
  }
  if (response.status === 401) {
    setToken(null)
    throw new CalendarError('auth-expired', 'Reconnect Google Calendar.')
  }
  if (response.status === 404) throw new NotFoundError('Not found.')
  if (!response.ok) throw new CalendarError('request-failed', `Google Calendar answered ${response.status}.`)
  return response.json().catch(() => null)
}

function requireToken(): string {
  const accessToken = currentCalendarToken()
  if (!accessToken) throw new CalendarError('auth-expired', 'Reconnect Google Calendar.')
  return accessToken
}

async function fetchCalendarEvents(calendarId: string, from: Date, to: Date, accessToken: string) {
  const events: CalendarEvent[] = []
  let pageToken: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      timeMin: from.toISOString(),
      timeMax: to.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
      fields: GOOGLE_EVENT_FIELDS,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const parsed = parseGoogleEventsPage(await getJson(`${eventsUrl(calendarId)}?${params.toString()}`, accessToken))
    events.push(...parsed.events)
    pageToken = parsed.nextPageToken
    if (!pageToken) break
  }
  return events
}

/**
 * Fetches the timed events that overlap `[from, to)` from each chosen calendar, or the primary calendar when none
 * is chosen. Events come back in calendar order; the suggestions drop the same meeting found in a second calendar.
 */
export async function fetchGoogleCalendarEvents(
  from: Date,
  to: Date,
  calendarIds: readonly string[] = [],
): Promise<CalendarEvent[]> {
  const accessToken = requireToken()
  const ids = calendarIds.length > 0 ? calendarIds : [PRIMARY_CALENDAR_ID]
  const perCalendar = await Promise.all(
    ids.map((id) =>
      // A chosen calendar that was deleted or unsubscribed from since is skipped rather than failing the others.
      fetchCalendarEvents(id, from, to, accessToken).catch((error: unknown) => {
        if (error instanceof NotFoundError) return []
        throw error
      }),
    ),
  )
  return perCalendar.flat()
}

/** Lists the calendars the user can choose from, primary first. */
export async function fetchGoogleCalendarList(): Promise<CalendarListItem[]> {
  const accessToken = requireToken()
  const calendars: CalendarListItem[] = []
  let pageToken: string | null = null
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const params = new URLSearchParams({
      maxResults: '250',
      minAccessRole: 'reader',
      fields: GOOGLE_CALENDAR_LIST_FIELDS,
    })
    if (pageToken) params.set('pageToken', pageToken)
    const response = await getJson(`${CALENDAR_LIST_URL}?${params.toString()}`, accessToken).catch((error: unknown) => {
      throw error instanceof NotFoundError
        ? new CalendarError('request-failed', 'Google Calendar answered 404.')
        : error
    })
    const parsed = parseGoogleCalendarListPage(response)
    calendars.push(...parsed.calendars)
    pageToken = parsed.nextPageToken
    if (!pageToken) break
  }
  return calendars.sort((a, b) => Number(b.primary) - Number(a.primary))
}

export type { CalendarListItem }

// Google Calendar access from the browser. It uses the Google Identity Services token client, so Calendar data goes
// straight from Google to this browser: no Cloud Function sees it and no refresh token is stored anywhere. The access
// token lasts about an hour and is kept for this browser tab only; after that the user reconnects with one click.
import type { CalendarEvent } from './calendarSuggestions'
import { GOOGLE_EVENT_FIELDS, parseGoogleEventsPage } from './googleCalendarEvents'

const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client'
/** Read-only access to events; Tickness never writes to the calendar. */
export const GOOGLE_CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const TOKEN_STORAGE_KEY = 'tickness.googleCalendarToken'
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

/** The OAuth client ID the instance owner created for Calendar access; empty when the feature is not set up. */
export function googleCalendarClientId(): string {
  return (import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID ?? '').trim()
}

/** The feature shows only when an OAuth client is configured, and never in the public demo. */
export function isGoogleCalendarAvailable(): boolean {
  return googleCalendarClientId() !== '' && import.meta.env.VITE_DEMO_MODE !== 'true'
}

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
  hasGrantedAllScopes: (response: TokenResponse, scope: string) => boolean
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
      scope: GOOGLE_CALENDAR_SCOPE,
      include_granted_scopes: false,
      callback: (response) => {
        if (response.error || !response.access_token) {
          reject(new CalendarError('scope-denied', 'Google Calendar access was not granted.'))
          return
        }
        if (!oauth2.hasGrantedAllScopes(response, GOOGLE_CALENDAR_SCOPE)) {
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

/** Fetches the timed events of the user's primary calendar that overlap `[from, to)`. */
export async function fetchGoogleCalendarEvents(from: Date, to: Date): Promise<CalendarEvent[]> {
  const accessToken = currentCalendarToken()
  if (!accessToken) throw new CalendarError('auth-expired', 'Reconnect Google Calendar.')
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
    let response: Response
    try {
      response = await fetch(`${EVENTS_URL}?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      })
    } catch {
      throw new CalendarError('request-failed', 'Google Calendar could not be reached.')
    }
    if (response.status === 401) {
      setToken(null)
      throw new CalendarError('auth-expired', 'Reconnect Google Calendar.')
    }
    if (!response.ok) throw new CalendarError('request-failed', `Google Calendar answered ${response.status}.`)
    const parsed = parseGoogleEventsPage(await response.json().catch(() => null))
    events.push(...parsed.events)
    pageToken = parsed.nextPageToken
    if (!pageToken) break
  }
  return events
}

// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { User } from 'firebase/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import type { CalendarPreferences } from '../../src/lib/calendarPreferences'
import type { CalendarListItem } from '../../src/lib/googleCalendar'
import { PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'

const calendar = vi.hoisted(() => ({
  token: 'token' as string | null,
  list: [] as CalendarListItem[],
  connectGoogleCalendar: vi.fn(async () => {}),
}))
const saveCalendarPreferences = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => {}))

vi.mock('../../src/lib/firebase', () => ({ db: {}, callFunction: vi.fn() }))
vi.mock('../../src/lib/googleCalendar', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/googleCalendar')>()),
  currentCalendarToken: () => calendar.token,
  subscribeToCalendarToken: () => () => {},
  connectGoogleCalendar: calendar.connectGoogleCalendar,
  fetchGoogleCalendarList: async () => calendar.list,
}))
vi.mock('../../src/lib/calendarPreferences', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/lib/calendarPreferences')>()),
  saveCalendarPreferences,
}))

const { CalendarPicker, KeywordRulesEditor } = await import('../../src/CalendarSuggestionSettings')

const catalog: Catalog = {
  clients: [],
  projects: [
    {
      id: 'p1',
      name: 'Internal',
      clientId: null,
      description: '',
      color: '#000',
      estimateMinutes: null,
      archived: false,
    },
  ],
  tasks: [],
}

const basePreferences: CalendarPreferences = {
  connected: true,
  calendarIds: [],
  dismissedEventIds: ['old'],
  seriesWork: {},
  keywordRules: [],
}

const user = { uid: 'u1' } as User

function renderWithTheme(node: React.ReactNode) {
  return render(<ThemeProvider theme={createAppTheme(PALETTES.forest)}>{node}</ThemeProvider>)
}

beforeEach(() => {
  calendar.token = 'token'
  calendar.list = [
    { id: 'me@example.com', name: 'me@example.com', primary: true },
    { id: 'team@example.com', name: 'Team', primary: false },
  ]
  calendar.connectGoogleCalendar.mockClear()
  saveCalendarPreferences.mockClear()
})

afterEach(() => cleanup())

describe('CalendarPicker', () => {
  it('starts with the primary calendar and saves the chosen calendars in list order', async () => {
    renderWithTheme(<CalendarPicker user={user} workspaceId="w1" preferences={basePreferences} />)
    const primary = await screen.findByRole('checkbox', { name: 'me@example.com (primary)' })
    expect((primary as HTMLInputElement).checked).toBe(true)
    const save = screen.getByRole('button', { name: 'Save calendars' }) as HTMLButtonElement
    expect(save.disabled).toBe(true)
    await userEvent.click(screen.getByRole('checkbox', { name: 'Team' }))
    await userEvent.click(save)
    expect(saveCalendarPreferences).toHaveBeenCalledWith('w1', 'u1', {
      ...basePreferences,
      calendarIds: ['me@example.com', 'team@example.com'],
    })
    expect(await screen.findByText('Calendars saved.')).toBeTruthy()
  })

  it('stores the primary calendar alone as the default, and needs at least one calendar', async () => {
    renderWithTheme(
      <CalendarPicker
        user={user}
        workspaceId="w1"
        preferences={{ ...basePreferences, calendarIds: ['team@example.com'] }}
      />,
    )
    const team = await screen.findByRole('checkbox', { name: 'Team' })
    expect((team as HTMLInputElement).checked).toBe(true)
    await userEvent.click(team)
    expect(screen.getByText('Choose at least one calendar.')).toBeTruthy()
    expect((screen.getByRole('button', { name: 'Save calendars' }) as HTMLButtonElement).disabled).toBe(true)
    await userEvent.click(screen.getByRole('checkbox', { name: 'me@example.com (primary)' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save calendars' }))
    expect(saveCalendarPreferences).toHaveBeenCalledWith('w1', 'u1', { ...basePreferences, calendarIds: [] })
  })

  it('asks to reconnect when the tab has no access token', async () => {
    calendar.token = null
    renderWithTheme(<CalendarPicker user={user} workspaceId="w1" preferences={basePreferences} />)
    expect(screen.getByText('Reconnect Google Calendar to choose calendars.')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Reconnect' }))
    expect(calendar.connectGoogleCalendar).toHaveBeenCalledTimes(1)
  })
})

describe('KeywordRulesEditor', () => {
  it('adds a rule with a project', async () => {
    renderWithTheme(<KeywordRulesEditor user={user} workspaceId="w1" preferences={basePreferences} catalog={catalog} />)
    expect(screen.getByText('No keyword rules yet.')).toBeTruthy()
    await userEvent.type(screen.getByRole('textbox', { name: 'Keyword' }), '  standup ')
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(screen.getByText('Choose a project for this keyword.')).toBeTruthy()
    expect(saveCalendarPreferences).not.toHaveBeenCalled()

    await userEvent.click(screen.getByRole('combobox', { name: /Project/ }))
    await userEvent.click(await screen.findByRole('option', { name: /Internal/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Add rule' }))
    expect(saveCalendarPreferences).toHaveBeenCalledWith('w1', 'u1', {
      ...basePreferences,
      keywordRules: [{ keyword: 'standup', projectId: 'p1', taskId: null }],
    })
    await waitFor(() => expect((screen.getByRole('textbox', { name: 'Keyword' }) as HTMLInputElement).value).toBe(''))
  })

  it('lists and removes rules', async () => {
    renderWithTheme(
      <KeywordRulesEditor
        user={user}
        workspaceId="w1"
        preferences={{
          ...basePreferences,
          keywordRules: [
            { keyword: 'standup', projectId: 'p1', taskId: null },
            { keyword: 'old', projectId: 'gone', taskId: null },
          ],
        }}
        catalog={catalog}
      />,
    )
    const list = screen.getByRole('list', { name: 'Keyword rules' })
    expect(within(list).getByText('“standup” → Internal')).toBeTruthy()
    expect(within(list).getByText('“old” → Archived or deleted project')).toBeTruthy()
    expect(screen.getByText('2 of 50 rules')).toBeTruthy()
    await userEvent.click(screen.getByRole('button', { name: 'Remove the rule for “old”' }))
    expect(saveCalendarPreferences).toHaveBeenCalledWith('w1', 'u1', {
      ...basePreferences,
      keywordRules: [{ keyword: 'standup', projectId: 'p1', taskId: null }],
    })
  })
})

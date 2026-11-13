import { ThemeProvider } from '@mui/material/styles'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEMO_ACCOUNTS } from '../../functions/src/demo/accounts'
import { DEMO_RESET_HOUR, DEMO_RESET_TIME_ZONE } from '../../functions/src/demo/schedule'
import { AppShell } from '../../src/AppShell'
import { DemoAccountsPanel, DemoPausedPage, DemoResetBanner } from '../../src/DemoMode'
import {
  DEMO_CONTACT_EMAIL,
  DEMO_CONTACT_LINKEDIN_URL,
  DEMO_LANDING_URL,
  demoLandingUrl,
  DEMO_SOURCE_URL,
  DEMO_SUPPORT_URL,
  formatDemoReset,
  nextDemoReset,
} from '../../src/lib/demo'
import { PALETTE_IDS, PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'

function render(element: ReactElement): string {
  return renderToStaticMarkup(<ThemeProvider theme={createAppTheme(PALETTES.forest)}>{element}</ThemeProvider>)
}

function renderShell(): string {
  return render(
    <AppShell
      brand="Ticknest"
      items={[{ value: 'home', label: 'Home', icon: null, section: 'Track' }]}
      active="home"
      onNavigate={() => {}}
      footer={null}
    >
      <p>Page content</p>
    </AppShell>,
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})

describe('nextDemoReset', () => {
  it('uses the seed schedule', () => {
    expect(DEMO_RESET_TIME_ZONE).toBe('Europe/Warsaw')
    expect(DEMO_RESET_HOUR).toBe(3)
  })

  it('returns today’s reset when it has not happened yet', () => {
    // 01:30 in Warsaw (CET, UTC+1).
    expect(nextDemoReset(new Date('2026-11-04T00:30:00Z')).toISOString()).toBe('2026-11-04T02:00:00.000Z')
  })

  it('returns tomorrow’s reset once today’s has passed', () => {
    expect(nextDemoReset(new Date('2026-11-04T02:00:00Z')).toISOString()).toBe('2026-11-05T02:00:00.000Z')
    expect(nextDemoReset(new Date('2026-11-04T22:30:00Z')).toISOString()).toBe('2026-11-05T02:00:00.000Z')
  })

  it('follows summer time in the reset time zone', () => {
    // 03:00 CEST is 01:00 UTC.
    expect(nextDemoReset(new Date('2026-07-10T12:00:00Z')).toISOString()).toBe('2026-07-11T01:00:00.000Z')
  })

  it('handles the days the clocks change', () => {
    // Clocks go forward at 02:00 on 29 March 2026, so 03:00 that day is already CEST.
    expect(nextDemoReset(new Date('2026-03-28T12:00:00Z')).toISOString()).toBe('2026-03-29T01:00:00.000Z')
    // Clocks go back from 03:00 CEST to 02:00 CET on 25 October 2026, so 03:00 that day is CET.
    expect(nextDemoReset(new Date('2026-10-24T12:00:00Z')).toISOString()).toBe('2026-10-25T02:00:00.000Z')
  })

  it('rolls over month and year ends', () => {
    expect(nextDemoReset(new Date('2026-12-31T12:00:00Z')).toISOString()).toBe('2027-01-01T02:00:00.000Z')
  })

  it('formats the reset in the viewer’s time zone', () => {
    const reset = new Date('2026-11-05T02:00:00Z')
    // The exact punctuation depends on the ICU version, so only check the parts.
    const formatted = formatDemoReset(reset, 'en-GB', 'America/New_York')
    expect(formatted).toMatch(/^Wed,? 21:00 GMT-5$/)
  })
})

describe('DemoResetBanner', () => {
  it('renders nothing when demo mode is off', () => {
    vi.stubEnv('VITE_DEMO_MODE', '')
    expect(render(<DemoResetBanner />)).toBe('')
    expect(renderShell()).not.toContain('Demo notice')
  })

  it('ignores values other than "true"', () => {
    vi.stubEnv('VITE_DEMO_MODE', '1')
    expect(render(<DemoResetBanner />)).toBe('')
  })

  it('shows the reset notice with the next reset time in the app shell', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    vi.useFakeTimers({ now: new Date('2026-11-04T10:00:00Z'), toFake: ['Date'] })
    const html = renderShell()
    expect(html).toContain('aria-label="Demo notice"')
    expect(html).toContain('reset every 24 hours')
    expect(html).toContain('dateTime="2026-11-05T02:00:00.000Z"')
    expect(html.indexOf('Demo notice')).toBeLessThan(html.indexOf('Page content'))
  })

  it('links to the source on GitHub in a new tab', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    const html = render(<DemoResetBanner />)
    expect(DEMO_SOURCE_URL).toBe('https://github.com/kacper-szewczyk/Ticknest')
    expect(html).toContain(`href="${DEMO_SOURCE_URL}"`)
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).toContain('View the source on GitHub')
    expect(html).toContain(`href="${DEMO_SUPPORT_URL}"`)
    expect(html).toContain('Buy me a coffee')
  })
})

describe('DemoAccountsPanel', () => {
  it('renders nothing when demo mode is off', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'false')
    expect(render(<DemoAccountsPanel onUse={() => {}} />)).toBe('')
  })

  it('lists every seeded account with a sign-in button described by its row', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    const html = render(<DemoAccountsPanel onUse={() => {}} />)
    expect(html).toContain('Try the demo')
    expect(html).toContain(DEMO_ACCOUNTS[0]!.password)
    for (const account of DEMO_ACCOUNTS) expect(html).toContain(account.email)
    expect(html.match(/<button/g)).toHaveLength(DEMO_ACCOUNTS.length)
    expect(html.match(/aria-describedby="[^"]+"/g)).toHaveLength(DEMO_ACCOUNTS.length)
    expect(html).toContain('role="status"')
    for (const role of ['Owner', 'Manager', 'Member']) expect(html).toContain(role)
    expect(html).toContain(`href="${DEMO_SOURCE_URL}"`)
  })

  it('links to support and contact options', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    const html = render(<DemoAccountsPanel onUse={() => {}} />)
    expect(DEMO_SUPPORT_URL).toBe('https://buymeacoffee.com/kszewczyk')
    expect(html).toContain(`href="${DEMO_SUPPORT_URL}"`)
    expect(html).toContain(`href="mailto:${DEMO_CONTACT_EMAIL}"`)
    expect(html).toContain(`href="${DEMO_CONTACT_LINKEDIN_URL}"`)
    expect(html).toContain('Buy me a coffee')
    expect(html).toContain('Star it on GitHub')
    expect(html).toContain('Get in touch')
  })

  it('links to the landing page in the visitor language', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    const html = render(<DemoAccountsPanel onUse={() => {}} />)
    expect(html).toContain(`href="${DEMO_LANDING_URL}/?utm_source=demo&amp;utm_medium=sign-in"`)
    expect(html).toContain('What is Ticknest?')
    expect(demoLandingUrl('pl')).toBe(`${DEMO_LANDING_URL}/pl/?utm_source=demo&utm_medium=sign-in`)
    expect(demoLandingUrl('es')).toBe(`${DEMO_LANDING_URL}/?utm_source=demo&utm_medium=sign-in`)
  })
})

describe('demo UI contrast', () => {
  function luminance(hex: string): number {
    const match = /^#([0-9a-f]{6})$/i.exec(hex)
    if (!match) throw new Error(`Expected an opaque #rrggbb color, got ${hex}`)
    const channels = [0, 2, 4].map((offset) => parseInt(match[1]!.slice(offset, offset + 2), 16) / 255)
    const [r, g, b] = channels.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
  }
  function contrast(a: string, b: string): number {
    const [lighter, darker] = [luminance(a), luminance(b)].sort((x, y) => y - x)
    return (lighter! + 0.05) / (darker! + 0.05)
  }

  it.each(PALETTE_IDS)('meets WCAG AA for normal text in the %s palette', (id) => {
    const palette = PALETTES[id]
    // Banner text on its background.
    expect(contrast(palette.app.accentSoftText, palette.app.accentSoft)).toBeGreaterThanOrEqual(4.5)
    // Panel text and outlined buttons on the tinted panel.
    expect(contrast(palette.text.primary, palette.app.tint)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.text.secondary, palette.app.tint)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(palette.primary.main, palette.app.tint)).toBeGreaterThanOrEqual(4.5)
  })
})

describe('DemoPausedPage', () => {
  it('renders nothing when demo mode is off', () => {
    vi.stubEnv('VITE_DEMO_MODE', '')
    expect(render(<DemoPausedPage />)).toBe('')
  })

  it('explains the pause and links to the source and support pages', () => {
    vi.stubEnv('VITE_DEMO_MODE', 'true')
    const html = render(<DemoPausedPage />)
    expect(html).toContain('The Ticknest demo is paused')
    expect(html).toContain(`href="${DEMO_SOURCE_URL}"`)
    expect(html).toContain(`href="${DEMO_SUPPORT_URL}"`)
  })
})

// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AppShell } from '../../src/AppShell'
import { useSidebarControls } from '../../src/sidebarControls'
import { PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'

const STORAGE_KEY = 'ticknest.sidebarCollapsed'

function CompactHeader() {
  const { expand } = useSidebarControls()
  return (
    <button type="button" onClick={expand}>
      Compact workspace
    </button>
  )
}

function renderShell(onNavigate = vi.fn()) {
  render(
    <ThemeProvider theme={createAppTheme(PALETTES.forest)}>
      <AppShell
        brand={<span>Full brand</span>}
        header={<span>Workspace switcher</span>}
        items={[
          { value: 'home', label: 'Home', icon: null, section: 'Track' },
          { value: 'reports', label: 'Reports', icon: null, section: 'Analyze' },
        ]}
        active="home"
        onNavigate={onNavigate}
        footer={<span>Full footer</span>}
        compactBrand={<span>Mark</span>}
        compactHeader={<CompactHeader />}
        compactFooter={<span>Compact footer</span>}
      >
        <p>Page content</p>
      </AppShell>
    </ThemeProvider>,
  )
  return { onNavigate, sidebar: screen.getByRole('complementary', { name: 'Sidebar' }) }
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AppShell desktop sidebar', () => {
  it('starts expanded with a collapse button', () => {
    const { sidebar } = renderShell()
    const collapse = within(sidebar).getByRole('button', { name: 'Collapse sidebar' })
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    expect(collapse.getAttribute('aria-controls')).toBe(sidebar.id)
    expect(within(sidebar).getByText('Full brand')).toBeTruthy()
    expect(within(sidebar).getByText('Workspace switcher')).toBeTruthy()
    expect(within(sidebar).getByText('Full footer')).toBeTruthy()
    expect(within(sidebar).queryByText('Mark')).toBeNull()
  })

  it('collapses to an icon rail, remembers it and moves focus to the expand button', async () => {
    const { sidebar, onNavigate } = renderShell()
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Collapse sidebar' }))

    const expand = within(sidebar).getByRole('button', { name: 'Expand sidebar' })
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(expand)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')

    // The full sidebar is unmounted, so its links can't take focus.
    expect(within(sidebar).queryByText('Full brand')).toBeNull()
    expect(within(sidebar).queryByText('Workspace switcher')).toBeNull()
    expect(within(sidebar).queryByText('Full footer')).toBeNull()
    expect(within(sidebar).getByText('Mark')).toBeTruthy()
    expect(within(sidebar).getByText('Compact footer')).toBeTruthy()

    // Icon-only items keep their names and still navigate.
    const home = within(sidebar).getByRole('button', { name: 'Home' })
    expect(home.getAttribute('aria-current')).toBe('page')
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Reports' }))
    expect(onNavigate).toHaveBeenCalledWith('reports')
  })

  it('expands again and forgets the collapsed state', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { sidebar } = renderShell()
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Expand sidebar' }))

    const collapse = within(sidebar).getByRole('button', { name: 'Collapse sidebar' })
    expect(document.activeElement).toBe(collapse)
    expect(within(sidebar).getByText('Workspace switcher')).toBeTruthy()
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
  })

  it('lets the compact header expand the sidebar', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { sidebar } = renderShell()
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Compact workspace' }))
    expect(within(sidebar).getByText('Workspace switcher')).toBeTruthy()
  })

  it('restores the saved collapsed state on load', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    const { sidebar } = renderShell()
    expect(within(sidebar).getByRole('button', { name: 'Expand sidebar' })).toBeTruthy()
    expect(within(sidebar).queryByRole('button', { name: 'Collapse sidebar' })).toBeNull()
  })

  it('falls back to expanded when storage is unavailable', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    const { sidebar } = renderShell()
    await userEvent.click(within(sidebar).getByRole('button', { name: 'Collapse sidebar' }))
    expect(within(sidebar).getByRole('button', { name: 'Expand sidebar' })).toBeTruthy()
  })

  it('keeps the small-screen drawer showing the full sidebar while collapsed', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    renderShell()
    // jsdom applies media queries at a fixed 1024px viewport that tests cannot resize, so the small-screen header
    // and drawer are display: none here. `hidden: true` finds them anyway.
    await userEvent.click(screen.getByRole('button', { name: 'Open navigation', hidden: true }))
    const drawer = screen.getByRole('presentation', { hidden: true })
    expect(within(drawer).getByText('Full brand')).toBeTruthy()
    expect(within(drawer).getByText('Workspace switcher')).toBeTruthy()
    expect(within(drawer).queryByRole('button', { name: 'Collapse sidebar', hidden: true })).toBeNull()
  })
})

// @vitest-environment jsdom
import { ThemeProvider } from '@mui/material/styles'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CatalogPanel } from '../../src/CatalogPanel'
import type { Catalog } from '../../src/lib/catalog'
import { PALETTES } from '../../src/palettes'
import { createAppTheme } from '../../src/theme'

let catalog: Catalog
const saveCatalogRecord = vi.fn()
const setCatalogArchived = vi.fn()

vi.mock('../../src/lib/catalog', () => ({
  subscribeToCatalog: (_workspaceId: string, onChange: (catalog: Catalog) => void) => {
    onChange(catalog)
    return () => {}
  },
  saveCatalogRecord: (...args: unknown[]) => saveCatalogRecord(...args),
  setCatalogArchived: (...args: unknown[]) => setCatalogArchived(...args),
}))

function renderPanel() {
  return render(
    <ThemeProvider theme={createAppTheme(PALETTES.forest)}>
      <CatalogPanel workspaceId="w1" />
    </ThemeProvider>,
  )
}

function project(id: string, name: string, clientId: string | null): Catalog['projects'][number] {
  return { id, name, clientId, description: '', color: '#668a6b', estimateMinutes: null, archived: false }
}

const rowTexts = () =>
  within(screen.getByRole('list'))
    .getAllByRole('listitem')
    .map((row) => row.textContent)
const searchBox = () => screen.getByRole('searchbox', { name: 'Search' }) as HTMLInputElement

beforeEach(() => {
  catalog = {
    clients: [
      { id: 'c1', name: 'Northwind', archived: false },
      { id: 'c2', name: 'Acme', archived: false },
      { id: 'c3', name: 'Globex', archived: true },
    ],
    projects: [project('p1', 'Site', 'c1'), project('p2', 'App', 'c1')],
    tasks: [],
  }
  saveCatalogRecord.mockReset().mockResolvedValue('new-id')
  setCatalogArchived.mockReset().mockResolvedValue(undefined)
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('CatalogPanel', () => {
  it('lists active clients by name with their active project count, and searches by name', async () => {
    const user = userEvent.setup()
    renderPanel()
    expect(rowTexts()).toEqual([
      expect.stringContaining('AcmeNo active projects'),
      expect.stringContaining('Northwind2 active projects'),
    ])
    expect(screen.getByRole('status').textContent).toBe('2 of 2 clients · 1 archived hidden')

    await user.type(searchBox(), 'NORTH')
    expect(rowTexts()).toHaveLength(1)
    expect(screen.getByRole('status').textContent).toContain('1 of 2 clients')

    await user.clear(searchBox())
    await user.type(searchBox(), 'initech')
    expect(screen.getByText('No clients match “initech”.')).toBeTruthy()
  })

  it('adds a client in a drawer and keeps the search', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.type(searchBox(), 'acme')
    await user.click(screen.getByRole('button', { name: 'Add client' }))
    const drawer = screen.getByRole('dialog', { name: 'New client' })
    await user.click(within(drawer).getByRole('button', { name: 'Add client' }))
    expect(within(drawer).getByText('Enter a name for this client.')).toBeTruthy()
    expect(saveCatalogRecord).not.toHaveBeenCalled()

    await user.type(within(drawer).getByRole('textbox', { name: /Name/ }), 'Initech')
    await user.click(within(drawer).getByRole('button', { name: 'Add client' }))
    expect(saveCatalogRecord).toHaveBeenCalledWith(
      'w1',
      'clients',
      expect.objectContaining({ name: 'Initech' }),
      undefined,
    )
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByText('Client added.')).toBeTruthy()
    expect(searchBox().value).toBe('acme')
  })

  it('opens a row for editing and asks before discarding changes', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Edit client Northwind' }))
    const drawer = screen.getByRole('dialog', { name: 'Edit client' })
    const name = within(drawer).getByRole('textbox', { name: /Name/ }) as HTMLInputElement
    expect(name.value).toBe('Northwind')

    await user.type(name, ' Ltd')
    await user.keyboard('{Escape}')
    expect(confirm).toHaveBeenCalledWith('Discard your changes to this client?')
    expect(screen.getByRole('dialog', { name: 'Edit client' })).toBeTruthy()

    await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))
    expect(saveCatalogRecord).toHaveBeenCalledWith(
      'w1',
      'clients',
      expect.objectContaining({ name: 'Northwind Ltd' }),
      expect.objectContaining({ id: 'c1' }),
    )
  })

  it('archives and restores from the row menu', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'More actions for Acme' }))
    await user.click(screen.getByRole('menuitem', { name: 'Archive' }))
    expect(setCatalogArchived).toHaveBeenCalledWith('w1', 'clients', 'c2', true)

    await user.click(screen.getByRole('checkbox', { name: 'Show archived' }))
    await user.click(screen.getByRole('button', { name: 'More actions for Globex' }))
    await user.click(screen.getByRole('menuitem', { name: 'Restore' }))
    expect(setCatalogArchived).toHaveBeenCalledWith('w1', 'clients', 'c3', false)
  })

  it('keeps an archived client selectable when editing a project that uses it', async () => {
    catalog.projects.push(project('p3', 'Legacy', 'c3'))
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Projects' }))
    await user.click(screen.getByRole('button', { name: 'Edit project Legacy' }))
    const drawer = screen.getByRole('dialog')
    const client = within(drawer).getByRole('combobox', { name: 'Client' }) as HTMLInputElement
    expect(client.value).toBe('Globex (archived)')

    await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))
    expect(saveCatalogRecord).toHaveBeenCalledWith(
      'w1',
      'projects',
      expect.objectContaining({ clientId: 'c3' }),
      expect.objectContaining({ id: 'p3' }),
    )
  })

  it('groups projects by client with No client last, folds groups, and searches client and description', async () => {
    catalog.projects.push(
      { ...project('p3', 'Brochure', 'c2'), description: 'Print run for the spring fair', estimateMinutes: 450 },
      project('p4', 'Internal', null),
      project('p5', 'Legacy', 'c3'),
    )
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Projects' }))
    const groups = () =>
      within(screen.getByRole('region', { name: 'All projects' }))
        .getAllByRole('region')
        .map((group) => [
          group.getAttribute('aria-label'),
          within(group)
            .queryAllByRole('listitem')
            .map((row) => row.querySelector('.MuiTypography-body2')?.textContent),
        ])
    expect(groups()).toEqual([
      ['Acme', ['Brochure']],
      ['Globex', ['Legacy']],
      ['Northwind', ['App', 'Site']],
      ['No client', ['Internal']],
    ])
    expect(screen.getByRole('button', { name: /Globex \(archived\)/ })).toBeTruthy()
    const brochure = screen.getByRole('button', { name: 'Edit project Brochure' })
    expect(brochure.textContent).toContain('Print run for the spring fair')
    expect(brochure.textContent).toContain('Est. 7:30')

    const northwind = screen.getByRole('button', { name: /^Northwind/ })
    expect(northwind.getAttribute('aria-expanded')).toBe('true')
    await user.click(northwind)
    expect(northwind.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('button', { name: 'Edit project Site' })).toBeNull()
    await user.click(northwind)

    await user.type(searchBox(), 'northwind')
    expect(groups()).toEqual([['Northwind', ['App', 'Site']]])
    await user.clear(searchBox())
    await user.type(searchBox(), 'SPRING')
    expect(groups()).toEqual([['Acme', ['Brochure']]])
    expect(screen.getByRole('status').textContent).toBe('1 of 5 projects')
  })

  it('saves a project with a client, a preset color, and an estimate in hours', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Projects' }))
    await user.click(screen.getByRole('button', { name: 'Add project' }))
    const drawer = screen.getByRole('dialog', { name: 'New project' })
    await user.type(within(drawer).getByRole('textbox', { name: /Name/ }), 'Launch')

    await user.click(within(drawer).getByRole('combobox', { name: 'Client' }))
    const options = screen.getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['No client', 'Acme', 'Northwind'])
    await user.keyboard('acm')
    await user.click(screen.getByRole('option', { name: 'Acme' }))

    const colors = within(drawer).getByRole('group', { name: 'Color' })
    expect((within(colors).getByRole('radio', { name: 'Sage' }) as HTMLInputElement).checked).toBe(true)
    await user.click(within(colors).getByRole('radio', { name: 'Blue' }))
    expect((within(colors).getByRole('radio', { name: 'Blue' }) as HTMLInputElement).checked).toBe(true)

    const estimate = within(drawer).getByRole('textbox', { name: 'Estimate (hours)' }) as HTMLInputElement
    await user.type(estimate, 'abc')
    await user.click(within(drawer).getByRole('button', { name: 'Add project' }))
    expect(within(drawer).getByText('Enter hours like 7.5 or 7:30.')).toBeTruthy()
    expect(saveCatalogRecord).not.toHaveBeenCalled()

    await user.clear(estimate)
    await user.type(estimate, '7.5')
    await user.tab()
    expect(estimate.value).toBe('7:30')
    await user.click(within(drawer).getByRole('button', { name: 'Add project' }))
    expect(saveCatalogRecord).toHaveBeenCalledWith(
      'w1',
      'projects',
      expect.objectContaining({ name: 'Launch', clientId: 'c2', color: '#1565c0', estimateMinutes: 450 }),
      undefined,
    )
  })

  it('accepts estimates over 99 hours and picks a custom color', async () => {
    catalog.projects[0] = { ...catalog.projects[0], color: '#123456', estimateMinutes: 450 }
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Projects' }))
    await user.click(screen.getByRole('button', { name: 'Edit project Site' }))
    const drawer = screen.getByRole('dialog', { name: 'Edit project' })
    const estimate = within(drawer).getByRole('textbox', { name: 'Estimate (hours)' }) as HTMLInputElement
    expect(estimate.value).toBe('7:30')
    const colors = within(drawer).getByRole('group', { name: 'Color' })
    expect((within(colors).getByRole('radio', { name: 'Custom color' }) as HTMLInputElement).checked).toBe(true)
    expect((within(drawer).getByLabelText('Custom color value') as HTMLInputElement).value).toBe('#123456')

    await user.clear(estimate)
    await user.type(estimate, '120:30')
    await user.click(within(drawer).getByRole('button', { name: 'Save changes' }))
    expect(saveCatalogRecord).toHaveBeenCalledWith(
      'w1',
      'projects',
      expect.objectContaining({ color: '#123456', estimateMinutes: 7230 }),
      expect.objectContaining({ id: 'p1' }),
    )
  })

  it('invites adding the first record when a tab is empty', async () => {
    const user = userEvent.setup()
    renderPanel()
    await user.click(screen.getByRole('button', { name: 'Tasks' }))
    expect(screen.getByText(/No tasks yet/)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: 'Add your first task' }))
    expect(screen.getByRole('dialog', { name: 'New task' })).toBeTruthy()
  })
})

import { describe, expect, it } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import {
  activeProjectCounts,
  filterCatalogRecords,
  groupProjectsByClient,
  groupTasksByProject,
  projectSearchText,
  selectableRecords,
  taskSearchText,
} from '../../src/lib/catalogList'
import { PROJECT_COLORS, presetProjectColor } from '../../src/lib/projectColors'

const clients: Catalog['clients'] = [
  { id: 'c1', name: 'Northwind', archived: false },
  { id: 'c2', name: 'acme Corp', archived: false },
  { id: 'c3', name: 'Old Acme', archived: true },
]

function project(id: string, clientId: string | null, archived = false): Catalog['projects'][number] {
  return { id, name: `Project ${id}`, clientId, description: '', color: '#668a6b', estimateMinutes: null, archived }
}

const ids = (records: { id: string }[]) => records.map((record) => record.id)

describe('filterCatalogRecords', () => {
  it('hides archived records unless asked, sorted by name ignoring case', () => {
    expect(filterCatalogRecords(clients, { query: '', showArchived: false })).toEqual({
      visible: [clients[1], clients[0]],
      total: 2,
    })
    const all = filterCatalogRecords(clients, { query: '', showArchived: true })
    expect(ids(all.visible)).toEqual(['c2', 'c1', 'c3'])
    expect(all.total).toBe(3)
  })

  it('matches every word of the query against the name, ignoring case', () => {
    expect(ids(filterCatalogRecords(clients, { query: '  ACME ', showArchived: true }).visible)).toEqual(['c2', 'c3'])
    expect(ids(filterCatalogRecords(clients, { query: 'acme old', showArchived: true }).visible)).toEqual(['c3'])
    expect(filterCatalogRecords(clients, { query: 'globex', showArchived: false })).toEqual({ visible: [], total: 2 })
  })
})

describe('activeProjectCounts', () => {
  it('counts only active projects that have a client', () => {
    const counts = activeProjectCounts([
      project('p1', 'c1'),
      project('p2', 'c1'),
      project('p3', 'c1', true),
      project('p4', null),
    ])
    expect([...counts]).toEqual([['c1', 2]])
  })
})

describe('selectableRecords', () => {
  it('lists active records and keeps the current one even when archived', () => {
    expect(selectableRecords(clients, '').map((client) => client.label)).toEqual(['acme Corp', 'Northwind'])
    expect(selectableRecords(clients, 'c3').map((client) => client.label)).toEqual([
      'acme Corp',
      'Northwind',
      'Old Acme (archived)',
    ])
  })
})

describe('projectSearchText', () => {
  it('lets a project search match the client name and the description', () => {
    const clientNames = new Map(clients.map((client) => [client.id, client.name]))
    const projects = [
      { ...project('p1', 'c1'), name: 'Site' },
      { ...project('p2', null), name: 'Internal', description: 'Spring offsite planning' },
      { ...project('p3', 'missing'), name: 'Orphan' },
    ]
    const search = (query: string) =>
      ids(
        filterCatalogRecords(projects, { query, showArchived: false }, (item) => projectSearchText(item, clientNames))
          .visible,
      )
    expect(search('northwind')).toEqual(['p1'])
    expect(search('OFFSITE spring')).toEqual(['p2'])
    expect(search('orphan')).toEqual(['p3'])
    expect(search('northwind site')).toEqual(['p1'])
  })
})

describe('groupProjectsByClient', () => {
  it('groups under clients sorted by name, with No client last and unknown clients counted as none', () => {
    const groups = groupProjectsByClient(
      [project('p1', 'c1'), project('p2', null), project('p3', 'c3'), project('p4', 'c2'), project('p5', 'gone')],
      clients,
    )
    expect(groups.map((group) => [group.clientId, group.name, group.clientArchived, ids(group.projects)])).toEqual([
      ['c2', 'acme Corp', false, ['p4']],
      ['c1', 'Northwind', false, ['p1']],
      ['c3', 'Old Acme', true, ['p3']],
      [null, 'No client', false, ['p2', 'p5']],
    ])
  })

  it('leaves out clients without projects', () => {
    expect(groupProjectsByClient([project('p1', 'c1')], clients).map((group) => group.name)).toEqual(['Northwind'])
    expect(groupProjectsByClient([], clients)).toEqual([])
  })
})

function task(id: string, projectId: string, archived = false): Catalog['tasks'][number] {
  return { id, name: `Task ${id}`, projectId, estimateMinutes: null, billable: false, archived }
}

describe('taskSearchText', () => {
  it('lets a task search match its project name', () => {
    const names = new Map([['p1', 'Website']])
    expect(taskSearchText(task('t1', 'p1'), names)).toContain('Website')
    expect(taskSearchText(task('t2', 'gone'), names).trim()).toBe('Task t2')
  })
})

describe('groupTasksByProject', () => {
  const projects = [
    { ...project('p1', 'c1'), name: 'Site', color: '#1565c0' },
    { ...project('p2', null), name: 'Internal' },
    { ...project('p3', 'c2'), name: 'Brochure' },
    { ...project('p4', 'c1'), name: 'App' },
    { ...project('p5', 'c1', true), name: 'Legacy' },
  ]
  const groupsOf = (tasks: Catalog['tasks'], includeEmpty = false) =>
    groupTasksByProject(tasks, { clients, projects }, includeEmpty).map((group) => [
      group.projectId,
      group.name,
      group.clientName,
      ids(group.tasks),
    ])

  it('orders groups by client then project name, with No project last', () => {
    const groups = groupTasksByProject(
      [task('t1', 'p1'), task('t2', 'gone'), task('t3', 'p2'), task('t4', 'p3'), task('t5', 'p1'), task('t6', 'p5')],
      { clients, projects },
    )
    expect(groups.map((group) => [group.projectId, group.name, group.clientName, ids(group.tasks)])).toEqual([
      ['p3', 'Brochure', 'acme Corp', ['t4']],
      ['p5', 'Legacy', 'Northwind', ['t6']],
      ['p1', 'Site', 'Northwind', ['t1', 't5']],
      ['p2', 'Internal', null, ['t3']],
      [null, 'No project', null, ['t2']],
    ])
    expect(groups[1].projectArchived).toBe(true)
    expect(groups[2].color).toBe('#1565c0')
    expect(groups[4].color).toBeNull()
  })

  it('adds empty groups for active projects only when asked', () => {
    expect(groupsOf([task('t1', 'p1')])).toEqual([['p1', 'Site', 'Northwind', ['t1']]])
    expect(groupsOf([task('t1', 'p1')], true)).toEqual([
      ['p3', 'Brochure', 'acme Corp', []],
      ['p4', 'App', 'Northwind', []],
      ['p1', 'Site', 'Northwind', ['t1']],
      ['p2', 'Internal', null, []],
    ])
  })
})

describe('presetProjectColor', () => {
  it('finds presets ignoring case and treats other colors as custom', () => {
    expect(presetProjectColor('#1565C0')?.name).toBe('Blue')
    expect(presetProjectColor('#123456')).toBeUndefined()
    expect(new Set(PROJECT_COLORS.map((color) => color.value)).size).toBe(PROJECT_COLORS.length)
  })
})

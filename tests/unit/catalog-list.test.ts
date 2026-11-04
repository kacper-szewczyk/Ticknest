import { describe, expect, it } from 'vitest'
import type { Catalog } from '../../src/lib/catalog'
import { activeProjectCounts, filterCatalogRecords, selectableRecords } from '../../src/lib/catalogList'

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

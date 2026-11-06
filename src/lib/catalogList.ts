import type { Catalog } from './catalog'
import { NO_CLIENT_GROUP } from './workOptions'

export type CatalogKind = keyof Catalog
export type CatalogRecord = Catalog[CatalogKind][number]

export const CATALOG_KINDS: readonly CatalogKind[] = ['clients', 'projects', 'tasks']

/** Singular and plural nouns for each catalog tab, e.g. for "Add client" or "No projects yet". */
export const CATALOG_NOUNS: Record<CatalogKind, { one: string; many: string }> = {
  clients: { one: 'client', many: 'clients' },
  projects: { one: 'project', many: 'projects' },
  tasks: { one: 'task', many: 'tasks' },
}

export type CatalogListFilters = { query: string; showArchived: boolean }

/** Records hidden only by the archived toggle stay out of both counts, so "N of M" reflects the search alone. */
export type CatalogListResult<T> = { visible: T[]; total: number }

/**
 * Filters one catalog tab by the search (every word must match, ignoring case) and the archived toggle, sorted by
 * name. The search looks at the name unless `searchText` gives more to match, such as a project's client.
 * `total` counts the records the archived toggle allows, before the search narrows them.
 */
export function filterCatalogRecords<T extends { name: string; archived: boolean }>(
  records: readonly T[],
  filters: CatalogListFilters,
  searchText: (record: T) => string = (record) => record.name,
): CatalogListResult<T> {
  const words = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const inScope = records.filter((record) => filters.showArchived || !record.archived)
  const visible = inScope
    .filter((record) => {
      const text = searchText(record).toLocaleLowerCase()
      return words.every((word) => text.includes(word))
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return { visible, total: inScope.length }
}

/** How many active (not archived) projects each client has, keyed by client ID. */
export function activeProjectCounts(projects: Catalog['projects']): Map<string, number> {
  const counts = new Map<string, number>()
  for (const project of projects) {
    if (project.archived || !project.clientId) continue
    counts.set(project.clientId, (counts.get(project.clientId) ?? 0) + 1)
  }
  return counts
}

/**
 * Options for a picker of active records. A record the form already points at stays listed even when it is
 * archived, so saving an unrelated change doesn't silently drop it.
 */
export function selectableRecords<T extends { id: string; name: string; archived: boolean }>(
  records: readonly T[],
  currentId: string | null | undefined,
): Array<T & { label: string }> {
  return records
    .filter((record) => !record.archived || record.id === currentId)
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    .map((record) => ({ ...record, label: record.archived ? `${record.name} (archived)` : record.name }))
}

/** The text a project search matches: its name, its client's name, and its description. */
export function projectSearchText(project: Catalog['projects'][number], clientNames: ReadonlyMap<string, string>) {
  return [project.name, project.clientId ? clientNames.get(project.clientId) : '', project.description].join(' ')
}

export type ProjectGroup = {
  /** The client ID, or null for projects without a client (or whose client no longer exists). */
  clientId: string | null
  name: string
  clientArchived: boolean
  projects: Catalog['projects']
}

/**
 * Groups projects under their client, clients sorted by name with "No client" last, like the budget target
 * picker. Projects keep their order, and clients without any of the given projects are left out.
 */
export function groupProjectsByClient(projects: Catalog['projects'], clients: Catalog['clients']): ProjectGroup[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]))
  const groups = new Map<string | null, ProjectGroup>()
  for (const project of projects) {
    const client = project.clientId ? clientsById.get(project.clientId) : undefined
    const clientId = client?.id ?? null
    let group = groups.get(clientId)
    if (!group) {
      group = {
        clientId,
        name: client?.name ?? NO_CLIENT_GROUP,
        clientArchived: client?.archived ?? false,
        projects: [],
      }
      groups.set(clientId, group)
    }
    group.projects.push(project)
  }
  const noClient = groups.get(null)
  groups.delete(null)
  const sorted = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  return noClient ? [...sorted, noClient] : sorted
}

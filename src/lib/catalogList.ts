import type { Catalog } from './catalog'

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
 * Filters one catalog tab by name (every word must match, ignoring case) and the archived toggle, sorted by name.
 * `total` counts the records the archived toggle allows, before the search narrows them.
 */
export function filterCatalogRecords<T extends { name: string; archived: boolean }>(
  records: readonly T[],
  filters: CatalogListFilters,
): CatalogListResult<T> {
  const words = filters.query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  const inScope = records.filter((record) => filters.showArchived || !record.archived)
  const visible = inScope
    .filter((record) => {
      const name = record.name.toLocaleLowerCase()
      return words.every((word) => name.includes(word))
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

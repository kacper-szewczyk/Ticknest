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

type Project = Catalog['projects'][number]
type Task = Catalog['tasks'][number]

export type ProjectGroup<P extends Project = Project> = {
  /** The client ID, or null for projects without a client (or whose client no longer exists). */
  clientId: string | null
  name: string
  clientArchived: boolean
  projects: P[]
}

/**
 * Groups projects under their client, clients sorted by name with "No client" last, like the budget target
 * picker. Projects keep their order, and clients without any of the given projects are left out.
 */
export function groupProjectsByClient<P extends Project>(
  projects: readonly P[],
  clients: Catalog['clients'],
): ProjectGroup<P>[] {
  const clientsById = new Map(clients.map((client) => [client.id, client]))
  const groups = new Map<string | null, ProjectGroup<P>>()
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

export const NO_PROJECT_GROUP = 'No project'

/** The text a task search matches: its name and its project's name. */
export function taskSearchText(task: Task, projectNames: ReadonlyMap<string, string>) {
  return [task.name, projectNames.get(task.projectId)].join(' ')
}

export type TaskGroup = {
  /** The project ID, or null for tasks whose project no longer exists. */
  projectId: string | null
  name: string
  color: string | null
  /** The project's client, or null when it has none. */
  clientName: string | null
  projectArchived: boolean
  tasks: Task[]
}

/**
 * Groups tasks under their project, in the order of the time-entry picker: by client (sorted by name, "No client"
 * last), then by project name. Tasks keep their order, and tasks whose project no longer exists come last under
 * "No project". With `includeEmptyProjects`, active projects without any of the given tasks get an empty group, so
 * the list can offer adding their first task.
 */
export function groupTasksByProject(
  tasks: readonly Task[],
  catalog: Pick<Catalog, 'clients' | 'projects'>,
  includeEmptyProjects = false,
): TaskGroup[] {
  const projectIds = new Set(catalog.projects.map((project) => project.id))
  const tasksByProject = new Map<string, Task[]>()
  const orphans: Task[] = []
  for (const task of tasks) {
    if (!projectIds.has(task.projectId)) {
      orphans.push(task)
      continue
    }
    const list = tasksByProject.get(task.projectId)
    if (list) list.push(task)
    else tasksByProject.set(task.projectId, [task])
  }
  const projects = catalog.projects
    .filter((project) => tasksByProject.has(project.id) || (includeEmptyProjects && !project.archived))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
  const groups: TaskGroup[] = groupProjectsByClient(projects, catalog.clients).flatMap((clientGroup) =>
    clientGroup.projects.map((project) => ({
      projectId: project.id,
      name: project.name,
      color: project.color,
      clientName: clientGroup.clientId ? clientGroup.name : null,
      projectArchived: project.archived,
      tasks: tasksByProject.get(project.id) ?? [],
    })),
  )
  if (orphans.length > 0) {
    groups.push({
      projectId: null,
      name: NO_PROJECT_GROUP,
      color: null,
      clientName: null,
      projectArchived: false,
      tasks: orphans,
    })
  }
  return groups
}

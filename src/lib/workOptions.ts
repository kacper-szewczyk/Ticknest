import type { Catalog, Client, Project } from './catalog'

// One row in the project/task picker. Choosing a project or a task also fixes the client, and a task
// carries its billable default, so the picker yields everything a time entry needs in one selection.
export type WorkOption = {
  key: string
  kind: 'client' | 'project' | 'task'
  group: string
  clientId: string | null
  clientName: string | null
  projectId: string | null
  projectName: string | null
  taskId: string | null
  taskName: string | null
  color: string | null
  billable: boolean
  archived: boolean
}

export type WorkSelection = { clientId: string | null; projectId: string | null; taskId: string | null }

export type WorkDetails = WorkSelection & {
  clientName: string | null
  projectName: string | null
  taskName: string | null
  billable: boolean
}

export const NO_CLIENT_GROUP = 'No client'
export const EMPTY_WORK_SELECTION: WorkSelection = { clientId: null, projectId: null, taskId: null }

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name)

export function workOptionKey(selection: WorkSelection): string | null {
  if (selection.taskId) return `task:${selection.taskId}`
  if (selection.projectId) return `project:${selection.projectId}`
  if (selection.clientId) return `client:${selection.clientId}`
  return null
}

/**
 * Builds picker rows grouped by client, each project followed by its tasks. Archived records and records
 * under an archived parent are hidden, except the current selection so an existing entry stays editable.
 */
export function buildWorkOptions(catalog: Catalog, current: WorkSelection = EMPTY_WORK_SELECTION): WorkOption[] {
  const clientsById = new Map(catalog.clients.map((client) => [client.id, client]))
  const isActiveClient = (id: string | null) => !id || clientsById.get(id)?.archived === false
  const isActiveProject = (project: Project) => !project.archived && isActiveClient(project.clientId)

  const projectOption = (project: Project, client: Client | undefined): WorkOption => ({
    key: `project:${project.id}`,
    kind: 'project',
    group: client?.name ?? NO_CLIENT_GROUP,
    clientId: client?.id ?? null,
    clientName: client?.name ?? null,
    projectId: project.id,
    projectName: project.name,
    taskId: null,
    taskName: null,
    color: project.color,
    billable: false,
    archived: !isActiveProject(project),
  })

  const groups: Array<{ client: Client | undefined; projects: Project[] }> = [
    ...[...catalog.clients].sort(byName).map((client) => ({
      client,
      projects: catalog.projects.filter((project) => project.clientId === client.id),
    })),
    {
      client: undefined,
      projects: catalog.projects.filter((project) => !project.clientId || !clientsById.has(project.clientId)),
    },
  ]

  const options: WorkOption[] = []
  for (const { client, projects } of groups) {
    if (client && client.id === current.clientId && !current.projectId) {
      options.push({
        key: `client:${client.id}`,
        kind: 'client',
        group: client.name,
        clientId: client.id,
        clientName: client.name,
        projectId: null,
        projectName: null,
        taskId: null,
        taskName: null,
        color: null,
        billable: false,
        archived: client.archived,
      })
    }
    for (const project of [...projects].sort(byName)) {
      const projectRow = projectOption(project, client)
      const taskRows = catalog.tasks
        .filter((task) => task.projectId === project.id)
        .filter((task) => task.id === current.taskId || (!task.archived && !projectRow.archived))
        .sort(byName)
        .map<WorkOption>((task) => ({
          ...projectRow,
          key: `task:${task.id}`,
          kind: 'task',
          taskId: task.id,
          taskName: task.name,
          billable: task.billable,
          archived: task.archived || projectRow.archived,
        }))
      if (projectRow.archived && project.id !== current.projectId && taskRows.length === 0) continue
      options.push(projectRow, ...taskRows)
    }
  }
  return options
}

export function workOptionLabel(option: WorkOption): string {
  if (option.kind === 'client') return option.clientName ?? ''
  return [option.projectName, option.taskName].filter(Boolean).join(' › ')
}

/**
 * Matches every search word against the client, project, and task names. A matching task keeps its
 * project row visible so the result still reads as a tree.
 */
export function filterWorkOptions(options: WorkOption[], query: string): WorkOption[] {
  const words = query.toLocaleLowerCase().split(/\s+/).filter(Boolean)
  if (words.length === 0) return options
  const matches = (option: WorkOption) => {
    const haystack = [option.clientName ?? NO_CLIENT_GROUP, option.projectName, option.taskName]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase()
    return words.every((word) => haystack.includes(word))
  }
  const matched = new Set(options.filter(matches).map((option) => option.key))
  for (const option of options) {
    if (option.kind === 'task' && matched.has(option.key)) matched.add(`project:${option.projectId}`)
  }
  return options.filter((option) => matched.has(option.key))
}

export function workDetails(option: WorkOption | null): WorkDetails {
  return {
    clientId: option?.clientId ?? null,
    clientName: option?.clientName ?? null,
    projectId: option?.projectId ?? null,
    projectName: option?.projectName ?? null,
    taskId: option?.taskId ?? null,
    taskName: option?.taskName ?? null,
    billable: option?.billable ?? false,
  }
}

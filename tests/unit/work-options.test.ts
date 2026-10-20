import { describe, expect, it } from 'vitest'
import type { Catalog, Project, Task } from '../../src/lib/catalog'
import { buildWorkOptions, filterWorkOptions, workDetails } from '../../src/lib/workOptions'

const project = (id: string, name: string, clientId: string | null, archived = false): Project => ({
  id,
  name,
  clientId,
  description: '',
  color: '#123456',
  estimateMinutes: null,
  archived,
})
const task = (id: string, name: string, projectId: string, billable = false, archived = false): Task => ({
  id,
  name,
  projectId,
  estimateMinutes: null,
  billable,
  archived,
})

const catalog: Catalog = {
  clients: [
    { id: 'zeta', name: 'Zeta', archived: false },
    { id: 'acme', name: 'Acme', archived: false },
    { id: 'old', name: 'Old Co', archived: true },
  ],
  projects: [
    project('web', 'Website', 'acme'),
    project('app', 'App', 'acme'),
    project('internal', 'Internal', null),
    project('legacy', 'Legacy', 'old'),
    project('ops', 'Ops', 'zeta', true),
  ],
  tasks: [
    task('design', 'Design', 'web', true),
    task('build', 'Build', 'web'),
    task('retired', 'Retired', 'web', false, true),
    task('legacy-task', 'Legacy task', 'legacy'),
  ],
}

const keys = (options: { key: string }[]) => options.map((option) => option.key)

describe('buildWorkOptions', () => {
  it('groups active projects by client with their tasks underneath, clients first and "No client" last', () => {
    const options = buildWorkOptions(catalog)
    expect(keys(options)).toEqual(['project:app', 'project:web', 'task:build', 'task:design', 'project:internal'])
    expect(options.map((option) => option.group)).toEqual(['Acme', 'Acme', 'Acme', 'Acme', 'No client'])
  })

  it('carries the client and the task billable flag on each row', () => {
    const design = buildWorkOptions(catalog).find((option) => option.key === 'task:design')
    expect(workDetails(design ?? null)).toEqual({
      clientId: 'acme',
      clientName: 'Acme',
      projectId: 'web',
      projectName: 'Website',
      taskId: 'design',
      taskName: 'Design',
      billable: true,
    })
  })

  it('keeps an archived selection so an existing entry remains editable', () => {
    const options = buildWorkOptions(catalog, { clientId: 'old', projectId: 'legacy', taskId: 'legacy-task' })
    const kept = options.filter((option) => option.archived)
    expect(keys(kept)).toEqual(['project:legacy', 'task:legacy-task'])
  })

  it('offers a client-only row for entries saved with a client but no project', () => {
    const options = buildWorkOptions(catalog, { clientId: 'zeta', projectId: null, taskId: null })
    expect(options.find((option) => option.key === 'client:zeta')).toMatchObject({ group: 'Zeta', kind: 'client' })
  })
})

describe('filterWorkOptions', () => {
  const options = buildWorkOptions(catalog)

  it('matches every word across client, project, and task names', () => {
    expect(keys(filterWorkOptions(options, 'acme web'))).toEqual(['project:web', 'task:build', 'task:design'])
  })

  it('keeps the parent project of a matching task', () => {
    expect(keys(filterWorkOptions(options, 'desi'))).toEqual(['project:web', 'task:design'])
  })

  it('returns every option for a blank query', () => {
    expect(filterWorkOptions(options, '  ')).toBe(options)
  })
})

import { useEffect, useState, type FormEvent } from 'react'
import { saveCatalogRecord, setCatalogArchived, subscribeToCatalog, type Catalog, type CatalogInput } from './lib/catalog'

const empty: Catalog = { clients: [], projects: [], tasks: [] }

export function CatalogPanel({ workspaceId }: { workspaceId: string }) {
  const [catalog, setCatalog] = useState(empty)
  const [kind, setKind] = useState<'clients' | 'projects' | 'tasks'>('clients')
  const [name, setName] = useState('')
  const [clientId, setClientId] = useState('')
  const [projectId, setProjectId] = useState('')
  const [description, setDescription] = useState('')
  const [color, setColor] = useState('#668a6b')
  const [estimate, setEstimate] = useState('')
  const [editing, setEditing] = useState<{ id: string } | undefined>()
  const [showArchived, setShowArchived] = useState(false)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => subscribeToCatalog(workspaceId, setCatalog, (issue) => setError(issue.message)), [workspaceId])
  const visible = catalog[kind].filter((record) => showArchived || !record.archived)

  function reset() { setName(''); setDescription(''); setEstimate(''); setEditing(undefined) }
  function beginEdit(record: { id: string; name: string }) {
    setEditing({ id: record.id }); setName(record.name)
    if (kind === 'projects') {
      const item = catalog.projects.find((project) => project.id === record.id)
      setClientId(item?.clientId ?? ''); setDescription(item?.description ?? ''); setColor(item?.color ?? '#668a6b'); setEstimate(item?.estimateMinutes?.toString() ?? '')
    } else if (kind === 'tasks') {
      const item = catalog.tasks.find((task) => task.id === record.id)
      setProjectId(item?.projectId ?? ''); setEstimate(item?.estimateMinutes?.toString() ?? '')
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setPending(true); setError('')
    const minutes = estimate ? Number(estimate) : null
    const input: CatalogInput = { name, clientId, projectId, description, color, estimateMinutes: minutes }
    try { await saveCatalogRecord(workspaceId, kind, input, editing); reset() }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not save this record.') }
    finally { setPending(false) }
  }
  async function archive(id: string, archived: boolean) {
    setPending(true); setError('')
    try { await setCatalogArchived(workspaceId, kind, id, archived) }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not update this record.') }
    finally { setPending(false) }
  }

  return <section className="catalog-card" aria-labelledby="catalog-heading">
    <div className="catalog-heading"><div><p className="section-kicker">WORK ORGANIZATION</p><h2 id="catalog-heading">Clients, projects &amp; tasks</h2></div><label className="archived-toggle"><input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} /> Show archived</label></div>
    <div className="catalog-tabs" role="tablist" aria-label="Catalog type">{(['clients', 'projects', 'tasks'] as const).map((item) => <button type="button" role="tab" aria-selected={kind === item} className={kind === item ? 'catalog-tab is-active' : 'catalog-tab'} key={item} onClick={() => { setKind(item); reset() }}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {error && <p className="form-message is-error" role="alert">{error}</p>}
    <form className="catalog-form" onSubmit={(event) => void submit(event)}><h3>{editing ? `Edit ${kind.slice(0, -1)}` : `Add ${kind.slice(0, -1)}`}</h3>
      <label>Name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required /></label>
      {kind === 'projects' && <><label>Client<select value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">No client</option>{catalog.clients.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Description<input value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} /></label><label>Color<input type="color" value={color} onChange={(event) => setColor(event.target.value)} /></label></>}
      {kind === 'tasks' && <label>Project<select value={projectId} onChange={(event) => setProjectId(event.target.value)} required><option value="">Select a project</option>{catalog.projects.filter((item) => !item.archived).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      {kind !== 'clients' && <label>Estimate (minutes)<input type="number" min="0" step="1" value={estimate} onChange={(event) => setEstimate(event.target.value)} placeholder="Optional" /></label>}
      <div className="catalog-form-actions">{editing && <button className="secondary-button" type="button" onClick={reset}>Cancel</button>}<button className="primary-button" disabled={pending}>{pending ? 'Saving…' : editing ? 'Save changes' : 'Add'}</button></div>
    </form>
    <div className="catalog-list">{visible.map((record) => {
      const archived = record.archived
      const detail = kind === 'projects' ? (record as Catalog['projects'][number]).description : kind === 'tasks' ? catalog.projects.find((project) => project.id === (record as Catalog['tasks'][number]).projectId)?.name : ''
      return <article className={`catalog-record${archived ? ' is-archived' : ''}`} key={record.id}><div><strong>{record.name}</strong>{detail && <span>{detail}</span>}{archived && <small>Archived</small>}</div><div className="catalog-record-actions"><button type="button" className="text-button" onClick={() => beginEdit(record)} disabled={pending}>Edit</button><button type="button" className="text-button" onClick={() => void archive(record.id, !archived)} disabled={pending}>{archived ? 'Restore' : 'Archive'}</button></div></article>
    })}{visible.length === 0 && <p className="empty-entries">No {kind} yet.</p>}</div>
  </section>
}

import { collection, doc, onSnapshot, serverTimestamp, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore'
import { db } from './firebase'

export type Client = { id: string; name: string; archived: boolean }
export type Project = { id: string; name: string; clientId: string | null; description: string; color: string; estimateMinutes: number | null; archived: boolean }
export type Task = { id: string; name: string; projectId: string; estimateMinutes: number | null; archived: boolean }
export type Catalog = { clients: Client[]; projects: Project[]; tasks: Task[] }
export type CatalogInput = { name: string; clientId?: string | null; projectId?: string; description?: string; color?: string; estimateMinutes?: number | null }

const path = (workspaceId: string, group: string) => collection(db, 'workspaces', workspaceId, group)
const records = <T extends { id: string }>(snapshot: { docs: Array<{ id: string; data(): Record<string, unknown> }> }) => snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as T)

export function subscribeToCatalog(workspaceId: string, onChange: (catalog: Catalog) => void, onError: (error: Error) => void): Unsubscribe {
  const catalog: Catalog = { clients: [], projects: [], tasks: [] }
  const stops = (['clients', 'projects', 'tasks'] as const).map((group) => onSnapshot(path(workspaceId, group), (snapshot) => {
    if (group === 'clients') catalog.clients = records<Client>(snapshot)
    else if (group === 'projects') catalog.projects = records<Project>(snapshot)
    else catalog.tasks = records<Task>(snapshot)
    onChange({ ...catalog })
  }, onError))
  return () => stops.forEach((stop) => stop())
}

export async function saveCatalogRecord(workspaceId: string, group: 'clients' | 'projects' | 'tasks', input: CatalogInput, existing?: { id: string }): Promise<void> {
  const name = input.name.trim()
  if (!name || name.length > 120) throw new Error('Names must be between 1 and 120 characters.')
  const ref = existing ? doc(path(workspaceId, group), existing.id) : doc(path(workspaceId, group))
  const fields = group === 'clients'
    ? { name }
    : group === 'projects'
      ? { name, clientId: input.clientId || null, description: (input.description ?? '').trim(), color: input.color || '#668a6b', estimateMinutes: input.estimateMinutes ?? null }
      : { name, projectId: input.projectId ?? '', estimateMinutes: input.estimateMinutes ?? null }
  if (existing) await updateDoc(ref, { ...fields, updatedAt: serverTimestamp() })
  else await setDoc(ref, { ...fields, archived: false, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
}

export async function setCatalogArchived(workspaceId: string, group: 'clients' | 'projects' | 'tasks', id: string, archived: boolean): Promise<void> {
  await updateDoc(doc(path(workspaceId, group), id), { archived, updatedAt: serverTimestamp() })
}

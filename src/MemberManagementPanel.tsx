import { useEffect, useState, type FormEvent } from 'react'
import {
  createWorkspaceInvitation,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  subscribeToWorkspaceInvitations,
  subscribeToWorkspaceMembers,
  type WorkspaceInvitation,
  type WorkspaceMember,
} from './lib/workspaces'

export function MemberManagementPanel({ workspaceId, currentUserId }: { workspaceId: string; currentUserId: string }) {
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([])
  const [email, setEmail] = useState('')
  const [invitationUrl, setInvitationUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setMembers([])
    setInvitations([])
    setInvitationUrl('')
    const handleError = (issue: Error) => setError(issue.message)
    const stopMembers = subscribeToWorkspaceMembers(workspaceId, setMembers, handleError)
    const stopInvitations = subscribeToWorkspaceInvitations(workspaceId, setInvitations, handleError)
    return () => { stopMembers(); stopInvitations() }
  }, [workspaceId])

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true); setError(''); setNotice(''); setInvitationUrl('')
    try {
      const invitation = await createWorkspaceInvitation(workspaceId, email)
      const url = new URL('/', window.location.origin)
      url.searchParams.set('workspace', workspaceId)
      url.searchParams.set('invite', invitation.invitationId)
      url.searchParams.set('token', invitation.token)
      setInvitationUrl(url.toString())
      setNotice(`Invitation created for ${email.trim()}. Copy the link and send it to them. It expires in 7 days.`)
      setEmail('')
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not create the invitation.') }
    finally { setPending(false) }
  }

  async function revoke(invitation: WorkspaceInvitation) {
    setPending(true); setError(''); setNotice('')
    try { await revokeWorkspaceInvitation(workspaceId, invitation.id); setNotice(`Invitation for ${invitation.email} revoked.`); setInvitationUrl('') }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not revoke this invitation.') }
    finally { setPending(false) }
  }

  async function remove(member: WorkspaceMember) {
    if (!window.confirm(`Remove ${member.displayName || member.email} from this workspace? Their historical time entries will be retained.`)) return
    setPending(true); setError(''); setNotice('')
    try { await removeWorkspaceMember(workspaceId, member.uid); setNotice(`${member.displayName || member.email} was removed. Historical entries were retained.`) }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not remove this member.') }
    finally { setPending(false) }
  }

  async function copyLink() {
    try { await navigator.clipboard.writeText(invitationUrl); setNotice('Invitation link copied.') }
    catch { setNotice('Select and copy the invitation link below.') }
  }

  return <section className="members-card" aria-labelledby="members-heading">
    <div className="members-heading"><div><p className="section-kicker">TEAM ACCESS</p><h2 id="members-heading">Workspace members</h2></div><span>{members.filter((member) => member.status !== 'removed').length} {members.filter((member) => member.status !== 'removed').length === 1 ? 'member' : 'members'}</span></div>
    {error && <p className="form-message is-error" role="alert">{error}</p>}
    {notice && <p className="form-message is-success" role="status">{notice}</p>}
    <form className="invite-form" onSubmit={(event) => void invite(event)} aria-busy={pending}>
      <label>Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required maxLength={254} placeholder="teammate@example.com" /></label>
      <button className="primary-button" type="submit" disabled={pending}>{pending ? 'Creating…' : 'Create invitation'}</button>
    </form>
    <p className="invite-help">We’ll create a secure, single-use link. Copy it and send it to the invited email address.</p>
    {invitationUrl && <div className="invite-link-box"><label>Invitation link<input value={invitationUrl} readOnly onFocus={(event) => event.currentTarget.select()} /></label><button className="secondary-button" type="button" onClick={() => void copyLink()}>Copy link</button></div>}
    {invitations.length > 0 && <div className="member-group"><h3>Pending invitations</h3>{invitations.map((invitation) => <article className="member-row" key={invitation.id}><div><strong>{invitation.email}</strong><span>Expires {invitation.expiresAt.toDate().toLocaleDateString()}</span></div><button className="text-button danger-link" type="button" onClick={() => void revoke(invitation)} disabled={pending}>Revoke</button></article>)}</div>}
    <div className="member-group"><h3>People with access</h3>{members.filter((member) => member.status !== 'removed').map((member) => <article className="member-row" key={member.uid}><div className="member-identity"><span className="member-avatar" aria-hidden="true">{(member.displayName || member.email || '?').slice(0, 1).toUpperCase()}</span><span><strong>{member.displayName || member.email}</strong><span>{member.email} · {member.role === 'owner' ? 'Owner' : 'Member'}</span></span></div>{member.role === 'member' && member.uid !== currentUserId && <button className="text-button danger-link" type="button" onClick={() => void remove(member)} disabled={pending}>Remove</button>}</article>)}{members.filter((member) => member.status !== 'removed').length === 0 && <p className="empty-entries">Loading members…</p>}</div>
    {members.some((member) => member.status === 'removed') && <div className="member-group"><h3>Past members</h3>{members.filter((member) => member.status === 'removed').map((member) => <article className="member-row is-removed" key={member.uid}><div><strong>{member.displayName || member.email}</strong><span>{member.email} · Removed</span></div></article>)}</div>}
  </section>
}

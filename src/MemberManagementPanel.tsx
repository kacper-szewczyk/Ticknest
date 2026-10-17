import { useEffect, useState, type FormEvent } from 'react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  createWorkspaceInvitation,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  subscribeToWorkspaceInvitations,
  subscribeToWorkspaceMembers,
  type WorkspaceInvitation,
  type WorkspaceMember,
} from './lib/workspaces'
import { EmptyText, FormMessage, ListRow, SectionCard, SectionHeading } from './ui'

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

  const activeMembers = members.filter((member) => member.status !== 'removed')
  const pastMembers = members.filter((member) => member.status === 'removed')

  return <SectionCard labelledBy="members-heading">
    <SectionHeading id="members-heading" kicker="TEAM ACCESS" title="Workspace members" action={<Chip label={`${activeMembers.length} ${activeMembers.length === 1 ? 'member' : 'members'}`} />} />
    {error && <FormMessage severity="error">{error}</FormMessage>}
    {notice && <FormMessage severity="success">{notice}</FormMessage>}
    <Stack component="form" direction={{ xs: 'column', sm: 'row' }} spacing={1.25} onSubmit={(event) => void invite(event)} aria-busy={pending} sx={{ mt: 2.5, alignItems: { sm: 'flex-start' } }}>
      <TextField label="Email address" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required placeholder="teammate@example.com" helperText="We’ll create a secure, single-use link. Copy it and send it to the invited email address." slotProps={{ htmlInput: { maxLength: 254 } }} />
      <Button variant="contained" type="submit" disabled={pending} sx={{ flex: '0 0 auto' }}>{pending ? 'Creating…' : 'Create invitation'}</Button>
    </Stack>
    {invitationUrl && <Paper variant="outlined" sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, alignItems: { sm: 'center' }, gap: 1.25, mt: 1.75, p: 1.5, bgcolor: '#f7faf4' }}>
      <TextField label="Invitation link" value={invitationUrl} onFocus={(event) => event.target.select()} slotProps={{ htmlInput: { readOnly: true } }} />
      <Button variant="outlined" onClick={() => void copyLink()} sx={{ flex: '0 0 auto' }}>Copy link</Button>
    </Paper>}
    {invitations.length > 0 && <Box sx={{ mt: 2.75 }}><Typography variant="h3">Pending invitations</Typography>{invitations.map((invitation) => <ListRow key={invitation.id}>
      <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}><Typography variant="body2" sx={{ fontWeight: 600 }}>{invitation.email}</Typography><Typography variant="caption" color="text.secondary">Expires {invitation.expiresAt.toDate().toLocaleDateString()}</Typography></Box>
      <Button size="small" color="error" onClick={() => void revoke(invitation)} disabled={pending}>Revoke</Button>
    </ListRow>)}</Box>}
    <Box sx={{ mt: 2.75 }}><Typography variant="h3">People with access</Typography>{activeMembers.map((member) => <ListRow key={member.uid}>
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
        <Avatar aria-hidden="true" sx={{ width: 32, height: 32, bgcolor: '#eaf1e7', color: 'primary.light', fontSize: 13, fontWeight: 700 }}>{(member.displayName || member.email || '?').slice(0, 1).toUpperCase()}</Avatar>
        <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}><Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>{member.displayName || member.email}</Typography><Typography variant="caption" color="text.secondary" noWrap>{member.email} · {member.role === 'owner' ? 'Owner' : 'Member'}</Typography></Box>
      </Stack>
      {member.role === 'member' && member.uid !== currentUserId && <Button size="small" color="error" onClick={() => void remove(member)} disabled={pending}>Remove</Button>}
    </ListRow>)}{activeMembers.length === 0 && <EmptyText>Loading members…</EmptyText>}</Box>
    {pastMembers.length > 0 && <Box sx={{ mt: 2.75 }}><Typography variant="h3">Past members</Typography>{pastMembers.map((member) => <ListRow key={member.uid}>
      <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}><Typography variant="body2" sx={{ fontWeight: 600 }}>{member.displayName || member.email}</Typography><Typography variant="caption" color="text.secondary">{member.email} · Removed</Typography></Box>
    </ListRow>)}</Box>}
  </SectionCard>
}

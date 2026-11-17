import { useEffect, useState, type FormEvent } from 'react'
import Avatar from '@mui/material/Avatar'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Collapse from '@mui/material/Collapse'
import Dialog from '@mui/material/Dialog'
import DialogActions from '@mui/material/DialogActions'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogTitle from '@mui/material/DialogTitle'
import ListItemText from '@mui/material/ListItemText'
import MenuItem from '@mui/material/MenuItem'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import {
  createWorkspaceInvitation,
  removeWorkspaceMember,
  revokeWorkspaceInvitation,
  setWorkspaceMemberRole,
  subscribeToWorkspaceInvitations,
  subscribeToWorkspaceMembers,
  type WorkspaceInvitation,
  type WorkspaceMember,
  type WorkspaceRole,
} from './lib/workspaces'
import { i18n, useAppLanguage, useTranslation } from './i18n'
import { isFeatureEnabled } from './lib/featureFlags'
import { invitationUrl } from './lib/inviteLink'
import { EmptyText, FormMessage, ListRow, SectionCard, SectionHeading } from './ui'

const ROLES: readonly WorkspaceRole[] = ['owner', 'manager', 'member']

// Roles come from Firestore, so an unexpected value is shown as a plain member rather than a missing key.
function roleLabel(role: WorkspaceRole): string {
  return i18n.t(`members.roles.${ROLES.includes(role) ? role : 'member'}`)
}

// Summaries of SPEC §2, shown under each role option and in the "About roles" hint. Budgets are left out when the
// feature is off, so the copy never promises a page nobody can open.
function roleDescriptions(): Record<WorkspaceRole, string> {
  const { t } = i18n
  return {
    owner: t('members.roleDescriptions.owner'),
    manager: isFeatureEnabled('budgets')
      ? t('members.roleDescriptions.managerWithBudgets')
      : t('members.roleDescriptions.manager'),
    member: t('members.roleDescriptions.member'),
  }
}

const ASSIGNABLE_ROLES = ['member', 'manager'] as const
type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

type RoleChange = { member: WorkspaceMember; role: AssignableRole }

function memberName(member: WorkspaceMember): string {
  return member.displayName || member.email
}

function isAssignableRole(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role)
}

function roleChangeConfirmation({ member, role }: RoleChange): { title: string; body: string; action: string } {
  const { t } = i18n
  const name = memberName(member)
  const copy = role === 'manager' ? 'makeManager' : 'makeMember'
  return {
    title: t(`members.${copy}.title`, { name }),
    body: isFeatureEnabled('budgets') ? t(`members.${copy}.bodyWithBudgets`) : t(`members.${copy}.body`),
    action: t(`members.${copy}.action`),
  }
}

function RoleChip({ role }: { role: WorkspaceRole }) {
  return (
    <Chip
      size="small"
      label={roleLabel(role)}
      color={role === 'owner' ? 'primary' : role === 'manager' ? 'secondary' : 'default'}
      variant={role === 'member' ? 'outlined' : 'filled'}
      sx={{ flex: '0 0 auto', fontWeight: 600 }}
    />
  )
}

export function MemberManagementPanel({ workspaceId, currentUserId }: { workspaceId: string; currentUserId: string }) {
  const { t } = useTranslation()
  const language = useAppLanguage()
  const descriptions = roleDescriptions()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [invitations, setInvitations] = useState<WorkspaceInvitation[]>([])
  const [email, setEmail] = useState('')
  const [inviteUrl, setInviteUrl] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  // Member rows lock one at a time, so changing one person never disables the whole list.
  const [busyMemberUid, setBusyMemberUid] = useState('')
  const [roleChange, setRoleChange] = useState<RoleChange | null>(null)
  const [showRoleHelp, setShowRoleHelp] = useState(false)

  // The parent keys this panel by workspace, so switching workspaces starts with fresh state.
  useEffect(() => {
    const handleError = (issue: Error) => setError(issue.message)
    const stopMembers = subscribeToWorkspaceMembers(workspaceId, setMembers, handleError)
    const stopInvitations = subscribeToWorkspaceInvitations(workspaceId, setInvitations, handleError)
    return () => {
      stopMembers()
      stopInvitations()
    }
  }, [workspaceId])

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    setError('')
    setNotice('')
    setInviteUrl('')
    try {
      const invitation = await createWorkspaceInvitation(workspaceId, email)
      setInviteUrl(invitationUrl(window.location.origin, workspaceId, invitation.invitationId, invitation.token))
      setNotice(t('members.invitationCreated', { email: email.trim() }))
      setEmail('')
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : t('members.createFailed'))
    } finally {
      setPending(false)
    }
  }

  async function revoke(invitation: WorkspaceInvitation) {
    setPending(true)
    setError('')
    setNotice('')
    try {
      await revokeWorkspaceInvitation(workspaceId, invitation.id)
      setNotice(t('members.revoked', { email: invitation.email }))
      setInviteUrl('')
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : t('members.revokeFailed'))
    } finally {
      setPending(false)
    }
  }

  async function remove(member: WorkspaceMember) {
    if (!window.confirm(t('members.confirmRemove', { name: memberName(member) }))) return
    setBusyMemberUid(member.uid)
    setError('')
    setNotice('')
    try {
      await removeWorkspaceMember(workspaceId, member.uid)
      setNotice(t('members.removed', { name: memberName(member) }))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : t('members.removeFailed'))
    } finally {
      setBusyMemberUid('')
    }
  }

  function requestRoleChange(member: WorkspaceMember, role: string) {
    if (role === member.role || !isAssignableRole(role)) return
    setRoleChange({ member, role })
  }

  async function confirmRoleChange() {
    if (!roleChange) return
    const { member, role } = roleChange
    const name = memberName(member)
    setRoleChange(null)
    setBusyMemberUid(member.uid)
    setError('')
    setNotice('')
    try {
      await setWorkspaceMemberRole(workspaceId, member.uid, role)
      setNotice(role === 'manager' ? t('members.nowManager', { name }) : t('members.nowMember', { name }))
    } catch (issue) {
      setError(issue instanceof Error ? issue.message : t('members.roleChangeFailed'))
    } finally {
      setBusyMemberUid('')
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(inviteUrl)
      setNotice(t('members.linkCopied'))
    } catch {
      setNotice(t('members.copyManually'))
    }
  }

  const activeMembers = members.filter((member) => member.status !== 'removed')
  const pastMembers = members.filter((member) => member.status === 'removed')

  return (
    <SectionCard labelledBy="members-heading">
      <SectionHeading
        id="members-heading"
        level={1}
        kicker={t('members.kicker')}
        title={t('members.title')}
        action={<Chip label={t('members.memberCount', { count: activeMembers.length })} />}
      />
      {error && <FormMessage severity="error">{error}</FormMessage>}
      {notice && <FormMessage severity="success">{notice}</FormMessage>}
      <Stack
        component="form"
        direction={{ xs: 'column', sm: 'row' }}
        spacing={1.25}
        onSubmit={(event) => void invite(event)}
        aria-busy={pending}
        sx={{ mt: 2.5, alignItems: { sm: 'flex-start' } }}
      >
        <TextField
          label={t('members.emailAddress')}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
          required
          placeholder="teammate@example.com"
          helperText={t('members.emailHelper')}
          slotProps={{ htmlInput: { maxLength: 254 } }}
        />
        <Button variant="contained" type="submit" disabled={pending} sx={{ flex: '0 0 auto' }}>
          {pending ? t('members.creating') : t('members.createInvitation')}
        </Button>
      </Stack>
      {inviteUrl && (
        <Paper
          variant="outlined"
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', sm: 'row' },
            alignItems: { sm: 'center' },
            gap: 1.25,
            mt: 1.75,
            p: 1.5,
            bgcolor: 'app.tint',
          }}
        >
          <TextField
            label={t('members.invitationLink')}
            value={inviteUrl}
            onFocus={(event) => event.target.select()}
            slotProps={{ htmlInput: { readOnly: true } }}
          />
          <Button variant="outlined" onClick={() => void copyLink()} sx={{ flex: '0 0 auto' }}>
            {t('members.copyLink')}
          </Button>
        </Paper>
      )}
      {invitations.length > 0 && (
        <Box sx={{ mt: 2.75 }}>
          <Typography variant="h3">{t('members.pendingInvitations')}</Typography>
          {invitations.map((invitation) => (
            <ListRow key={invitation.id}>
              <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {invitation.email}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('members.expires', { date: invitation.expiresAt.toDate().toLocaleDateString(language) })}
                </Typography>
              </Box>
              <Button size="small" color="error" onClick={() => void revoke(invitation)} disabled={pending}>
                {t('members.revoke')}
              </Button>
            </ListRow>
          ))}
        </Box>
      )}
      <Box sx={{ mt: 2.75 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
          <Typography variant="h3">{t('members.peopleWithAccess')}</Typography>
          <Button
            size="small"
            onClick={() => setShowRoleHelp((shown) => !shown)}
            aria-expanded={showRoleHelp}
            aria-controls="about-roles"
          >
            {t('members.aboutRoles')}
          </Button>
        </Stack>
        <Collapse in={showRoleHelp}>
          <Paper id="about-roles" variant="outlined" sx={{ mt: 1, p: 1.5, bgcolor: 'app.tint' }}>
            <Box component="dl" sx={{ m: 0, display: 'grid', gap: 1 }}>
              {(['owner', 'manager', 'member'] as const).map((role) => (
                <Box key={role}>
                  <Typography component="dt" variant="body2" sx={{ fontWeight: 600 }}>
                    {roleLabel(role)}
                  </Typography>
                  <Typography component="dd" variant="body2" color="text.secondary" sx={{ m: 0 }}>
                    {descriptions[role]}
                  </Typography>
                </Box>
              ))}
            </Box>
          </Paper>
        </Collapse>
        {activeMembers.map((member) => {
          const name = memberName(member)
          const isBusy = busyMemberUid === member.uid
          const canManage = member.role !== 'owner' && member.uid !== currentUserId
          return (
            <ListRow key={member.uid} sx={{ flexWrap: { xs: 'wrap', sm: 'nowrap' } }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center', minWidth: 0 }}>
                <Avatar
                  aria-hidden="true"
                  sx={{
                    width: 32,
                    height: 32,
                    bgcolor: 'app.accentSoft',
                    color: 'app.accentSoftText',
                    fontSize: 13,
                    fontWeight: 700,
                  }}
                >
                  {(member.displayName || member.email || '?').slice(0, 1).toUpperCase()}
                </Avatar>
                <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: 'center', minWidth: 0 }}>
                    <Typography variant="body2" noWrap sx={{ fontWeight: 600 }}>
                      {name}
                    </Typography>
                    <RoleChip role={member.role} />
                    {member.uid === currentUserId && (
                      <Typography variant="caption" color="text.secondary">
                        {t('members.you')}
                      </Typography>
                    )}
                  </Stack>
                  <Typography variant="caption" color="text.secondary" noWrap>
                    {member.email}
                  </Typography>
                </Box>
              </Stack>
              {canManage && (
                <Stack
                  direction="row"
                  spacing={1}
                  aria-busy={isBusy}
                  sx={{ flex: '0 0 auto', alignItems: 'center', ml: 'auto' }}
                >
                  <TextField
                    select
                    size="small"
                    label={t('members.role')}
                    value={member.role === 'manager' ? 'manager' : 'member'}
                    onChange={(event) => requestRoleChange(member, event.target.value)}
                    disabled={isBusy}
                    sx={{ width: 140 }}
                    slotProps={{
                      select: {
                        // Name the person, not just "Role", so each row's control is distinct to screen readers.
                        SelectDisplayProps: {
                          'aria-label': t('members.roleFor', { name }),
                          'aria-labelledby': undefined,
                        },
                        renderValue: (value) => roleLabel(value as AssignableRole),
                        MenuProps: { slotProps: { paper: { sx: { maxWidth: 320 } } } },
                      },
                    }}
                  >
                    {ASSIGNABLE_ROLES.map((role) => (
                      <MenuItem key={role} value={role} sx={{ whiteSpace: 'normal' }}>
                        <ListItemText
                          primary={roleLabel(role)}
                          secondary={descriptions[role]}
                          slotProps={{ primary: { sx: { fontWeight: 600 } } }}
                        />
                      </MenuItem>
                    ))}
                  </TextField>
                  <Button size="small" color="error" onClick={() => void remove(member)} disabled={isBusy}>
                    {t('members.remove')}
                  </Button>
                </Stack>
              )}
            </ListRow>
          )
        })}
        {activeMembers.length === 0 && <EmptyText>{t('members.loading')}</EmptyText>}
      </Box>
      {pastMembers.length > 0 && (
        <Box sx={{ mt: 2.75 }}>
          <Typography variant="h3">{t('members.pastMembers')}</Typography>
          {pastMembers.map((member) => (
            <ListRow key={member.uid}>
              <Box sx={{ display: 'grid', gap: 0.5, minWidth: 0, overflowWrap: 'anywhere' }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {member.displayName || member.email}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  {t('members.removedMember', { email: member.email })}
                </Typography>
              </Box>
            </ListRow>
          ))}
        </Box>
      )}
      <RoleChangeDialog
        change={roleChange}
        onCancel={() => setRoleChange(null)}
        onConfirm={() => void confirmRoleChange()}
      />
    </SectionCard>
  )
}

function RoleChangeDialog({
  change,
  onCancel,
  onConfirm,
}: {
  change: RoleChange | null
  onCancel: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  // Keep the last change on screen while the dialog fades out.
  const [shownChange, setShownChange] = useState(change)
  if (change && change !== shownChange) setShownChange(change)
  const copy = shownChange ? roleChangeConfirmation(shownChange) : null
  return (
    <Dialog
      open={change !== null}
      onClose={onCancel}
      maxWidth="xs"
      fullWidth
      aria-labelledby="role-change-title"
      aria-describedby="role-change-body"
      slotProps={{ paper: { sx: { borderRadius: '16px' } } }}
    >
      {copy && (
        <>
          <DialogTitle id="role-change-title" sx={{ fontWeight: 650 }}>
            {copy.title}
          </DialogTitle>
          <DialogContent>
            <DialogContentText id="role-change-body">{copy.body}</DialogContentText>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={onCancel}>{t('common.cancel')}</Button>
            <Button variant="contained" onClick={onConfirm} autoFocus>
              {copy.action}
            </Button>
          </DialogActions>
        </>
      )}
    </Dialog>
  )
}

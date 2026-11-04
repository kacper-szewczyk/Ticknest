import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { type FormEvent, useState } from 'react'
import { readableError } from './lib/errors'
import { invitationUrl } from './lib/inviteLink'
import {
  type InviteFailure,
  type InviteResult,
  inviteFailureKind,
  isCreatedInvite,
  isValidInviteEmail,
  mergeInviteResults,
  parseInviteEmails,
} from './lib/onboarding'
import { createWorkspaceInvitation } from './lib/workspaces'
import { FormMessage } from './ui'

const STATUS_LABELS: Record<InviteResult['status'], string> = {
  created: 'Invitation created',
  'already-member': 'Already a member',
  'already-invited': 'Already invited',
  invalid: 'Invalid email',
  failed: 'Not sent',
}

const FAILURE_MESSAGES: Record<Exclude<InviteFailure, 'failed'>, string> = {
  invalid: 'Check the address and try again.',
  'already-member': 'This person is already in the workspace.',
  'already-invited': 'They already have a pending invitation. You can find it under Members.',
}

async function inviteOne(workspaceId: string, email: string): Promise<InviteResult> {
  if (!isValidInviteEmail(email)) return { email, status: 'invalid', message: FAILURE_MESSAGES.invalid }
  try {
    const invitation = await createWorkspaceInvitation(workspaceId, email)
    const link = invitationUrl(window.location.origin, workspaceId, invitation.invitationId, invitation.token)
    return { email, status: 'created', link }
  } catch (error) {
    const kind = inviteFailureKind(error)
    return { email, status: kind, message: kind === 'failed' ? readableError(error) : FAILURE_MESSAGES[kind] }
  }
}

/**
 * The last, optional setup step: the owner lists teammates' addresses and gets a single-use invitation
 * link for each. Every address is invited on its own, so one failure never blocks the rest.
 */
export function InviteTeamStep({
  workspaceId,
  onDone,
}: {
  workspaceId: string
  /** Leaves the step, with how many invitations were created (0 when skipped). */
  onDone: (invitedCount: number) => void
}) {
  const [text, setText] = useState('')
  const [results, setResults] = useState<InviteResult[]>([])
  const [pending, setPending] = useState(false)
  const [error, setError] = useState('')
  const [copyNotice, setCopyNotice] = useState('')
  // Addresses whose link could not be copied automatically, so the link is shown for manual copying.
  const [manualCopy, setManualCopy] = useState<string[]>([])

  const created = results.filter(isCreatedInvite)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const emails = parseInviteEmails(text)
    if (emails.length === 0) {
      setError('Enter at least one email address.')
      return
    }
    setPending(true)
    setError('')
    setCopyNotice('')
    try {
      const outcomes = await Promise.all(emails.map((email) => inviteOne(workspaceId, email)))
      setResults((current) => mergeInviteResults(current, outcomes))
      // Keep only the addresses worth correcting or retrying, so a recoverable failure loses nothing.
      setText(
        outcomes
          .filter((result) => result.status === 'invalid' || result.status === 'failed')
          .map((result) => result.email)
          .join('\n'),
      )
    } finally {
      setPending(false)
    }
  }

  async function copy(value: string, notice: string, fallbackEmails: string[]) {
    try {
      await navigator.clipboard.writeText(value)
      setCopyNotice(notice)
    } catch {
      setManualCopy((current) => [...new Set([...current, ...fallbackEmails])])
      setCopyNotice('Your browser blocked copying. Select and copy the link below instead.')
    }
  }

  return (
    <Paper
      component="form"
      variant="outlined"
      onSubmit={(event) => void handleSubmit(event)}
      aria-busy={pending}
      aria-labelledby="setup-step-heading"
      sx={{ display: 'grid', gap: 2, p: { xs: 2.25, sm: 4 }, borderRadius: '18px' }}
    >
      <div>
        <Typography variant="h2" id="setup-step-heading" sx={{ fontSize: 23 }}>
          Invite your team
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          Add teammates so they can track time here too. Each gets a secure, single-use link that expires in 7 days.
          Copy the links and send them yourself. You can skip this and invite people later under Members.
        </Typography>
      </div>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      <TextField
        label="Email addresses"
        value={text}
        onChange={(event) => setText(event.target.value)}
        multiline
        minRows={3}
        autoFocus
        placeholder={'alex@example.com\nsam@example.com'}
        helperText="Separate addresses with commas, spaces, or new lines."
        slotProps={{ htmlInput: { 'aria-describedby': 'invite-results' } }}
      />
      <Box id="invite-results" aria-live="polite">
        {copyNotice && (
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {copyNotice}
          </Typography>
        )}
        {results.length > 0 && (
          <Box component="ul" sx={{ display: 'grid', gap: 1, m: 0, p: 0, listStyle: 'none' }}>
            {results.map((result) => (
              <Paper
                component="li"
                key={result.email}
                variant="outlined"
                sx={{ display: 'grid', gap: 1, p: 1.5, bgcolor: result.status === 'created' ? 'app.tint' : undefined }}
              >
                <Stack
                  direction={{ xs: 'column', sm: 'row' }}
                  sx={{ alignItems: { sm: 'center' }, justifyContent: 'space-between', gap: 1 }}
                >
                  <Stack direction="row" sx={{ alignItems: 'center', gap: 1, minWidth: 0 }}>
                    <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>{result.email}</Typography>
                    <Chip
                      size="small"
                      label={STATUS_LABELS[result.status]}
                      color={
                        result.status === 'created'
                          ? 'success'
                          : result.status === 'invalid' || result.status === 'failed'
                            ? 'error'
                            : 'default'
                      }
                    />
                  </Stack>
                  {result.status === 'created' && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={() => void copy(result.link, `Link for ${result.email} copied.`, [result.email])}
                      aria-label={`Copy invitation link for ${result.email}`}
                      sx={{ flex: '0 0 auto', alignSelf: { xs: 'flex-start', sm: 'center' } }}
                    >
                      Copy link
                    </Button>
                  )}
                </Stack>
                {result.status !== 'created' && (
                  <Typography variant="body2" color="text.secondary">
                    {result.message}
                  </Typography>
                )}
                {result.status === 'created' && manualCopy.includes(result.email) && (
                  <TextField
                    label={`Invitation link for ${result.email}`}
                    value={result.link}
                    size="small"
                    onFocus={(event) => event.target.select()}
                    slotProps={{ htmlInput: { readOnly: true } }}
                  />
                )}
              </Paper>
            ))}
          </Box>
        )}
      </Box>
      <Stack direction={{ xs: 'column-reverse', sm: 'row' }} spacing={1} sx={{ justifyContent: 'flex-end' }}>
        {created.length > 1 && (
          <Button
            onClick={() =>
              void copy(
                created.map((result) => `${result.email}: ${result.link}`).join('\n'),
                'All invitation links copied.',
                created.map((result) => result.email),
              )
            }
            disabled={pending}
          >
            Copy all links
          </Button>
        )}
        <Button
          variant={created.length > 0 ? 'contained' : 'text'}
          onClick={() => onDone(created.length)}
          disabled={pending}
        >
          {created.length > 0 ? 'Done' : 'Skip'}
        </Button>
        <Button
          variant={created.length > 0 ? 'outlined' : 'contained'}
          type="submit"
          disabled={pending || !text.trim()}
        >
          {pending ? 'Creating…' : created.length > 0 ? 'Invite more' : 'Create invitations'}
        </Button>
      </Stack>
    </Paper>
  )
}

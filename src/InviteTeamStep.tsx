import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import { type FormEvent, useState } from 'react'
import { i18n, useTranslation } from './i18n'
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

function statusLabel(status: InviteResult['status']): string {
  const labels: Record<InviteResult['status'], string> = {
    created: i18n.t('invite.statusCreated'),
    'already-member': i18n.t('invite.statusAlreadyMember'),
    'already-invited': i18n.t('invite.statusAlreadyInvited'),
    invalid: i18n.t('invite.statusInvalid'),
    failed: i18n.t('invite.statusFailed'),
  }
  return labels[status]
}

function failureMessage(failure: Exclude<InviteFailure, 'failed'>): string {
  const messages: Record<Exclude<InviteFailure, 'failed'>, string> = {
    invalid: i18n.t('invite.failureInvalid'),
    'already-member': i18n.t('invite.failureAlreadyMember'),
    'already-invited': i18n.t('invite.failureAlreadyInvited'),
  }
  return messages[failure]
}

async function inviteOne(workspaceId: string, email: string): Promise<InviteResult> {
  if (!isValidInviteEmail(email)) return { email, status: 'invalid', message: failureMessage('invalid') }
  try {
    const invitation = await createWorkspaceInvitation(workspaceId, email)
    const link = invitationUrl(window.location.origin, workspaceId, invitation.invitationId, invitation.token)
    return { email, status: 'created', link }
  } catch (error) {
    const kind = inviteFailureKind(error)
    return { email, status: kind, message: kind === 'failed' ? readableError(error) : failureMessage(kind) }
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
  const { t } = useTranslation()
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
      setError(t('invite.enterAtLeastOne'))
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
      setCopyNotice(t('invite.copyBlocked'))
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
          {t('invite.title')}
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75 }}>
          {t('invite.intro')}
        </Typography>
      </div>
      {error && <FormMessage severity="error">{error}</FormMessage>}
      <TextField
        label={t('invite.emailAddresses')}
        value={text}
        onChange={(event) => setText(event.target.value)}
        multiline
        minRows={3}
        autoFocus
        placeholder={'alex@example.com\nsam@example.com'}
        helperText={t('invite.emailHelper')}
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
                      label={statusLabel(result.status)}
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
                      onClick={() =>
                        void copy(result.link, t('invite.linkCopied', { email: result.email }), [result.email])
                      }
                      aria-label={t('invite.copyLinkFor', { email: result.email })}
                      sx={{ flex: '0 0 auto', alignSelf: { xs: 'flex-start', sm: 'center' } }}
                    >
                      {t('invite.copyLink')}
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
                    label={t('invite.linkFor', { email: result.email })}
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
                t('invite.allLinksCopied'),
                created.map((result) => result.email),
              )
            }
            disabled={pending}
          >
            {t('invite.copyAllLinks')}
          </Button>
        )}
        <Button
          variant={created.length > 0 ? 'contained' : 'text'}
          onClick={() => onDone(created.length)}
          disabled={pending}
        >
          {created.length > 0 ? t('invite.done') : t('invite.skip')}
        </Button>
        <Button
          variant={created.length > 0 ? 'outlined' : 'contained'}
          type="submit"
          disabled={pending || !text.trim()}
        >
          {pending ? t('invite.creating') : created.length > 0 ? t('invite.inviteMore') : t('invite.createInvitations')}
        </Button>
      </Stack>
    </Paper>
  )
}

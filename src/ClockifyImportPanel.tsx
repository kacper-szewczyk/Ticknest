import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import FormControlLabel from '@mui/material/FormControlLabel'
import LinearProgress from '@mui/material/LinearProgress'
import Radio from '@mui/material/Radio'
import RadioGroup from '@mui/material/RadioGroup'
import Typography from '@mui/material/Typography'
import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import { useTranslation } from './i18n'
import type { Catalog } from './lib/catalog'
import {
  type ClockifyFile,
  type ClockifyFileError,
  type DateOrder,
  type ImportReport,
  type RowProblem,
  type UnknownUserPolicy,
  availableTimeZones,
  buildImportPlan,
  readClockifyFile,
  runImport,
} from './lib/clockifyImport'
import { formatElapsed } from './lib/dates'
import { readableError } from './lib/errors'
import { type WorkspaceMember, subscribeToWorkspaceMembers } from './lib/workspaces'
import { FormMessage, SectionCard, SectionHeading, SelectField } from './ui'

// Long lists in the preview and report show this many items, then a count of the rest.
const LIST_LIMIT = 10
const PROBLEM_LIMIT = 100
const DATE_ORDERS: DateOrder[] = ['dmy', 'mdy', 'ymd']

type Props = {
  workspaceId: string
  currentUserId: string
  catalog: Catalog
  /** The importer's own time zone, preselected as the zone the export was made in. */
  defaultTimeZone: string
}

/** Imports a Clockify "Detailed report" CSV export. Shown to the workspace owner and managers. */
export function ClockifyImportPanel({ workspaceId, currentUserId, catalog, defaultTimeZone }: Props) {
  const { t } = useTranslation()
  const [members, setMembers] = useState<WorkspaceMember[] | undefined>()
  const [fileName, setFileName] = useState('')
  const [file, setFile] = useState<ClockifyFile | null>(null)
  const [dateOrder, setDateOrder] = useState<DateOrder>('dmy')
  const [timeZone, setTimeZone] = useState(defaultTimeZone)
  const [unknownUsers, setUnknownUsers] = useState<UnknownUserPolicy>('skip')
  const [sentRows, setSentRows] = useState<number | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [error, setError] = useState('')

  useEffect(
    () => subscribeToWorkspaceMembers(workspaceId, setMembers, (loadError) => setError(readableError(loadError))),
    [workspaceId],
  )

  const plan = useMemo(
    () =>
      file && members
        ? buildImportPlan(file, members, catalog, { dateOrder, timeZone, unknownUsers, importerUid: currentUserId })
        : null,
    [file, members, catalog, dateOrder, timeZone, unknownUsers, currentUserId],
  )
  const timeZones = useMemo(() => availableTimeZones(defaultTimeZone), [defaultTimeZone])
  const importing = sentRows !== null && report === null

  function fileErrorMessage(fileError: ClockifyFileError): string {
    if (fileError.kind === 'empty') return t('import.fileEmpty')
    if (fileError.kind === 'tooManyRows') return t('import.fileTooManyRows', { max: fileError.max.toLocaleString() })
    return t('import.fileMissingColumns', { columns: fileError.columns.join(', ') })
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0]
    // Clear the input so choosing the same file again still fires a change.
    event.target.value = ''
    if (!selected) return
    reset()
    setFileName(selected.name)
    try {
      const result = readClockifyFile(await selected.text())
      if (!result.ok) {
        setError(fileErrorMessage(result.error))
        return
      }
      setFile(result.file)
      setDateOrder(result.file.detectedDateOrder ?? 'dmy')
    } catch (readError) {
      setError(readableError(readError))
    }
  }

  function reset() {
    setFile(null)
    setFileName('')
    setSentRows(null)
    setReport(null)
    setError('')
  }

  async function handleImport() {
    if (!plan || plan.rows.length === 0) return
    setError('')
    setSentRows(0)
    const result = await runImport(workspaceId, plan, setSentRows)
    setReport(result.report)
    if (result.error) setError(t('import.stopped', { message: readableError(result.error) }))
  }

  return (
    <SectionCard labelledBy="clockify-import-heading">
      <SectionHeading id="clockify-import-heading" kicker={t('import.kicker')} title={t('import.title')} />
      <Typography variant="body2" color="text.secondary" sx={{ mt: 1, lineHeight: 1.6 }}>
        {t('import.intro')}
      </Typography>
      {error && <FormMessage severity="error">{error}</FormMessage>}

      {!report && (
        <Box sx={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1.5, mt: 2.5 }}>
          <Button variant={file ? 'outlined' : 'contained'} component="label" disabled={importing || !members}>
            {file ? t('import.chooseAnother') : t('import.chooseFile')}
            <input type="file" accept=".csv,text/csv" hidden onChange={(event) => void handleFile(event)} />
          </Button>
          {fileName && (
            <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
              {fileName}
            </Typography>
          )}
        </Box>
      )}

      {file && plan && !report && (
        <Box sx={{ display: 'grid', gap: 2.5, mt: 3 }}>
          <Box sx={{ display: 'grid', gap: 2, gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' } }}>
            <SelectField
              label={t('import.dateFormat')}
              value={dateOrder}
              onChange={(event) => setDateOrder(event.target.value as DateOrder)}
              disabled={importing}
              helperText={file.detectedDateOrder ? t('import.dateFormatDetected') : t('import.dateFormatAmbiguous')}
            >
              {DATE_ORDERS.map((order) => (
                <option key={order} value={order}>
                  {t(`import.dateOrders.${order}`)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label={t('import.timeZone')}
              value={timeZone}
              onChange={(event) => setTimeZone(event.target.value)}
              disabled={importing}
              helperText={t('import.timeZoneHelp')}
            >
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </SelectField>
          </Box>

          <section aria-labelledby="import-users-heading">
            <Typography id="import-users-heading" variant="subtitle2" component="h3">
              {t('import.usersHeading')}
            </Typography>
            <Box component="ul" sx={{ m: 0, mt: 1, pl: 2.5, display: 'grid', gap: 0.5 }}>
              {plan.users.map((user) => (
                <Typography component="li" variant="body2" key={user.email} sx={{ overflowWrap: 'anywhere' }}>
                  {user.member
                    ? t('import.userMatched', {
                        email: user.email,
                        member: user.member.displayName || user.email,
                        count: user.rowCount,
                      })
                    : t('import.userNotMember', { email: user.email, count: user.rowCount })}
                </Typography>
              ))}
            </Box>
            {plan.users.some((user) => !user.member) && (
              <RadioGroup
                aria-label={t('import.unknownUsersLabel')}
                value={unknownUsers}
                onChange={(event) => setUnknownUsers(event.target.value as UnknownUserPolicy)}
                sx={{ mt: 1 }}
              >
                <FormControlLabel
                  value="skip"
                  control={<Radio size="small" />}
                  label={t('import.unknownUsersSkip')}
                  disabled={importing}
                />
                <FormControlLabel
                  value="assign-to-me"
                  control={<Radio size="small" />}
                  label={t('import.unknownUsersAssign')}
                  disabled={importing}
                />
              </RadioGroup>
            )}
          </section>

          <section aria-labelledby="import-catalog-heading">
            <Typography id="import-catalog-heading" variant="subtitle2" component="h3">
              {t('import.catalogHeading')}
            </Typography>
            {plan.catalog.clients.length + plan.catalog.projects.length + plan.catalog.tasks.length === 0 ? (
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                {t('import.catalogNothing')}
              </Typography>
            ) : (
              <Box sx={{ display: 'grid', gap: 0.75, mt: 0.5 }}>
                <NameList
                  label={t('import.newClients', { count: plan.catalog.clients.length })}
                  names={plan.catalog.clients}
                />
                <NameList
                  label={t('import.newProjects', { count: plan.catalog.projects.length })}
                  names={plan.catalog.projects.map((project) =>
                    project.clientName ? `${project.name} (${project.clientName})` : project.name,
                  )}
                />
                <NameList
                  label={t('import.newTasks', { count: plan.catalog.tasks.length })}
                  names={plan.catalog.tasks.map((task) => `${task.name} (${task.projectName})`)}
                />
              </Box>
            )}
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
              {t('import.catalogNote')}
            </Typography>
          </section>

          <section aria-labelledby="import-summary-heading">
            <Typography id="import-summary-heading" variant="subtitle2" component="h3">
              {t('import.summaryHeading')}
            </Typography>
            <Typography variant="body2" sx={{ mt: 0.5 }}>
              {t('import.summaryReady', { count: plan.rows.length, duration: formatElapsed(plan.totalSeconds) })}
            </Typography>
            {plan.shortenedCount > 0 && (
              <Typography variant="body2" color="text.secondary">
                {t('import.summaryShortened', { count: plan.shortenedCount })}
              </Typography>
            )}
            <Typography variant="body2" color="text.secondary">
              {t('import.summaryOverlapNote')}
            </Typography>
            {plan.problems.length > 0 && <ProblemList problems={plan.problems} />}
          </section>

          {importing ? (
            <Box role="status" aria-live="polite">
              <Typography variant="body2" sx={{ mb: 1 }}>
                {t('import.progress', { sent: sentRows, total: plan.rows.length })}
              </Typography>
              <LinearProgress
                variant="determinate"
                value={plan.rows.length ? (100 * (sentRows ?? 0)) / plan.rows.length : 0}
                aria-label={t('import.progressLabel')}
              />
            </Box>
          ) : (
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1.5 }}>
              <Button variant="contained" disabled={plan.rows.length === 0} onClick={() => void handleImport()}>
                {t('import.start', { count: plan.rows.length })}
              </Button>
              <Button onClick={reset}>{t('import.cancel')}</Button>
            </Box>
          )}
        </Box>
      )}

      {report && (
        <Box sx={{ mt: 3 }} role="status">
          <Typography variant="subtitle2" component="h3">
            {report.notSentCount > 0 ? t('import.reportStoppedHeading') : t('import.reportHeading')}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {t('import.reportImported', {
              count: report.importedCount,
              duration: formatElapsed(report.importedSeconds),
            })}
          </Typography>
          <Typography variant="body2">
            {t('import.reportCreated', {
              clients: report.created.clients,
              projects: report.created.projects,
              tasks: report.created.tasks,
            })}
          </Typography>
          {report.notSentCount > 0 && (
            <Typography variant="body2">{t('import.reportNotSent', { count: report.notSentCount })}</Typography>
          )}
          {report.skipped.length > 0 && <ProblemList problems={report.skipped} />}
          <Button variant="outlined" onClick={reset} sx={{ mt: 2 }}>
            {t('import.importAnother')}
          </Button>
        </Box>
      )}
    </SectionCard>
  )
}

function NameList({ label, names }: { label: string; names: string[] }) {
  const { t } = useTranslation()
  if (names.length === 0) return null
  const shown = names.slice(0, LIST_LIMIT)
  return (
    <Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>
      <strong>{label}:</strong> {shown.join(', ')}
      {names.length > shown.length && ` ${t('import.andMore', { count: names.length - shown.length })}`}
    </Typography>
  )
}

function ProblemList({ problems }: { problems: RowProblem[] }) {
  const { t } = useTranslation()
  const shown = problems.slice(0, PROBLEM_LIMIT)
  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {t('import.skippedHeading', { count: problems.length })}
      </Typography>
      <Box component="ul" sx={{ m: 0, mt: 0.5, pl: 2.5, maxHeight: 280, overflowY: 'auto' }}>
        {shown.map((problem) => (
          <Typography component="li" variant="body2" key={`${problem.line}-${problem.reason}`}>
            {t('import.skippedRow', { line: problem.line, reason: t(`import.reasons.${problem.reason}`) })}
          </Typography>
        ))}
      </Box>
      {problems.length > shown.length && (
        <Typography variant="body2" color="text.secondary">
          {t('import.andMore', { count: problems.length - shown.length })}
        </Typography>
      )}
    </Box>
  )
}

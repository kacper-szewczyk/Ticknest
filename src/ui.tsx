import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import TextField, { type TextFieldProps } from '@mui/material/TextField'
import Typography from '@mui/material/Typography'
import type { SxProps, Theme } from '@mui/material/styles'
import { keyframes } from '@emotion/react'
import type { ReactNode } from 'react'

export function SectionCard({
  labelledBy,
  sx,
  children,
}: {
  labelledBy: string
  sx?: SxProps<Theme>
  children: ReactNode
}) {
  return (
    <Paper
      component="section"
      variant="outlined"
      aria-labelledby={labelledBy}
      sx={[
        { maxWidth: 750, mx: 'auto', mt: 2.25, p: { xs: 2.25, sm: 4 }, borderRadius: '18px', minWidth: 0 },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Paper>
  )
}

export function SectionHeading({
  id,
  kicker,
  title,
  action,
}: {
  id: string
  kicker: string
  title: string
  action?: ReactNode
}) {
  return (
    <Stack
      direction={{ xs: 'column', sm: 'row' }}
      sx={{ alignItems: { xs: 'flex-start', sm: 'center' }, justifyContent: 'space-between', gap: 2 }}
    >
      <div>
        <Typography variant="overline" component="p" sx={{ display: 'block' }}>
          {kicker}
        </Typography>
        <Typography variant="h2" id={id}>
          {title}
        </Typography>
      </div>
      {action}
    </Stack>
  )
}

export function FormMessage({ severity, children }: { severity: 'error' | 'success'; children: ReactNode }) {
  return (
    <Alert severity={severity} role={severity === 'error' ? 'alert' : 'status'} sx={{ my: 1.5 }}>
      {children}
    </Alert>
  )
}

// Native selects keep form validation and mobile pickers; the label always floats because "" is a real option.
export function SelectField({ slotProps, ...props }: TextFieldProps) {
  return (
    <TextField select {...props} slotProps={{ ...slotProps, select: { native: true }, inputLabel: { shrink: true } }} />
  )
}

export function ListRow({ children, sx }: { children: ReactNode; sx?: SxProps<Theme> }) {
  return (
    <Box
      component="article"
      sx={[
        {
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 1.5,
          py: 1.5,
          borderBottom: 1,
          borderColor: 'divider',
          minWidth: 0,
        },
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    >
      {children}
    </Box>
  )
}

export function BillableChip() {
  return <Chip label="Billable" color="success" variant="outlined" />
}

export function EmptyText({ children }: { children: ReactNode }) {
  return (
    <Typography variant="body2" color="text.secondary" sx={{ py: 1.5 }}>
      {children}
    </Typography>
  )
}

const stopwatchSweep = keyframes`to { transform: rotate(360deg); }`

// Ticknest's loading indicator: a stopwatch whose hand sweeps the dial (frozen by the global reduced-motion rule).
export function StopwatchLoader({ size = 28 }: { size?: number }) {
  return (
    <Box
      component="svg"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      sx={{
        width: size,
        height: size,
        stroke: (theme) => theme.palette.primary.main,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        strokeWidth: 2,
        '& .stopwatch-hand': {
          transformBox: 'view-box',
          transformOrigin: '12px 14px',
          animation: `${stopwatchSweep} 1.2s linear infinite`,
        },
      }}
    >
      <path d="M10 2h4M12 2v3M18.5 6.5l1.5-1.5" />
      <circle cx="12" cy="14" r="8" />
      <path className="stopwatch-hand" d="M12 14V9" />
      <circle cx="12" cy="14" r="0.5" />
    </Box>
  )
}

export function LoadingState({ label, sx }: { label: string; sx?: SxProps<Theme> }) {
  return (
    <Stack
      role="status"
      spacing={2}
      sx={[{ alignItems: 'center', color: 'text.secondary' }, ...(Array.isArray(sx) ? sx : [sx])]}
    >
      <StopwatchLoader />
      <Typography variant="body2">{label}</Typography>
    </Stack>
  )
}

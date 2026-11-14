// The browser tab title while a timer runs, so the elapsed time is visible when the tab is in the background.

const APP_NAME = 'Ticknest'

/** Elapsed time for the tab title: hours without padding, for example `0:42:13`. */
function formatTabElapsed(seconds: number): string {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
    .toString()
    .padStart(2, '0')
  const remainder = (seconds % 60).toString().padStart(2, '0')
  return `${hours}:${minutes}:${remainder}`
}

/**
 * The tab title for a running timer: `0:42:13 · Homepage wireframe review — Ticknest`. The label is the entry's
 * description, or its project name when there is none; with neither, the title is just the time and the app name.
 */
export function runningTimerTitle(
  elapsedSeconds: number,
  entry: { description: string; projectName?: string | null },
): string {
  const label = entry.description.trim() || entry.projectName?.trim() || ''
  const elapsed = formatTabElapsed(Math.max(0, Math.floor(elapsedSeconds)))
  return `${label ? `${elapsed} · ${label}` : elapsed} — ${APP_NAME}`
}

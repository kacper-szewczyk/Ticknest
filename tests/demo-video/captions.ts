// Captions for the launch demo video, one per step of the walkthrough in record.spec.ts. The recording script times
// each caption to its step, so editing the wording here never needs new timings. Keep each line short enough to
// read in the time its step takes (about 3–10 s), and keep the English and Polish lists in step.

export const CAPTION_STEPS = [
  'intro',
  'startTimer',
  'running',
  'stopTimer',
  'timesheet',
  'reports',
  'exportPdf',
  'members',
  'invite',
  'outro',
] as const

export type CaptionStep = (typeof CAPTION_STEPS)[number]
export type CaptionLanguage = 'en' | 'pl'

export const CAPTIONS: Record<CaptionLanguage, Record<CaptionStep, string>> = {
  en: {
    intro: 'Ticknest: free, open-source time tracking for small teams.',
    startTimer: 'Say what you are working on, pick a project, and start the timer.',
    running: 'The timer keeps running across tabs and devices.',
    stopTimer: 'Stop it when you are done. The entry lands in your timesheet.',
    timesheet: 'The timesheet shows your week, day by day.',
    reports: 'Reports total the hours by project, client, and teammate.',
    exportPdf: 'Export a report as a PDF or CSV for clients and invoices.',
    members: 'Owners see everyone in the workspace and manage their roles.',
    invite: 'Invite a teammate with a secure, single-use link.',
    outro: 'Try the public demo or host it yourself. Link in the description.',
  },
  pl: {
    intro: 'Ticknest: darmowa, otwarta aplikacja do mierzenia czasu dla małych zespołów.',
    startTimer: 'Wpisz, nad czym pracujesz, wybierz projekt i uruchom stoper.',
    running: 'Stoper działa dalej w innych kartach i na innych urządzeniach.',
    stopTimer: 'Zatrzymaj go po skończonej pracy. Wpis trafia do karty czasu.',
    timesheet: 'Karta czasu pokazuje cały tydzień, dzień po dniu.',
    reports: 'Raporty sumują godziny według projektów, klientów i osób.',
    exportPdf: 'Wyeksportuj raport do PDF lub CSV dla klientów i faktur.',
    members: 'Właściciel widzi wszystkich w przestrzeni roboczej i zarządza ich rolami.',
    invite: 'Zaproś osobę z zespołu bezpiecznym, jednorazowym linkiem.',
    outro: 'Wypróbuj publiczne demo albo uruchom je u siebie. Link w opisie.',
  },
}

/** A caption on screen from `start` to `end`, in seconds from the start of the video. */
export type Cue = { step: CaptionStep; start: number; end: number }

function srtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000))
  const ms = totalMs % 1000
  const totalSeconds = Math.floor(totalMs / 1000)
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  return `${pad(Math.floor(totalSeconds / 3600))}:${pad(Math.floor(totalSeconds / 60) % 60)}:${pad(totalSeconds % 60)},${pad(ms, 3)}`
}

/**
 * Renders the cues as a SubRip (.srt) file, the format YouTube and LinkedIn accept for uploaded captions. Cues are
 * sorted by start time, empty ones are dropped, and a cue that would overlap the next one ends where the next begins.
 */
export function toSrt(cues: readonly Cue[], language: CaptionLanguage): string {
  const sorted = cues.filter((cue) => cue.end > cue.start).toSorted((a, b) => a.start - b.start)
  return sorted
    .map((cue, index) => {
      const next = sorted[index + 1]
      const end = next ? Math.min(cue.end, next.start) : cue.end
      return `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(end)}\n${CAPTIONS[language][cue.step]}\n`
    })
    .join('\n')
}

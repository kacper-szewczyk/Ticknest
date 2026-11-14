import { describe, expect, it } from 'vitest'
import { CAPTION_STEPS, CAPTIONS, toSrt } from '../demo-video/captions'

describe('demo video captions', () => {
  it('has an English and a Polish caption for every step', () => {
    for (const language of ['en', 'pl'] as const) {
      for (const step of CAPTION_STEPS) expect(CAPTIONS[language][step].trim()).not.toBe('')
    }
  })

  it('renders numbered SubRip cues with hour, minute, second and millisecond times', () => {
    const srt = toSrt(
      [
        { step: 'intro', start: 0, end: 3.2 },
        { step: 'outro', start: 3725.5, end: 3730.0004 },
      ],
      'en',
    )
    expect(srt).toBe(
      `1\n00:00:00,000 --> 00:00:03,200\n${CAPTIONS.en.intro}\n\n` +
        `2\n01:02:05,500 --> 01:02:10,000\n${CAPTIONS.en.outro}\n`,
    )
  })

  it('sorts cues, drops empty ones, and trims overlaps', () => {
    const srt = toSrt(
      [
        { step: 'reports', start: 5, end: 9 },
        { step: 'timesheet', start: 1, end: 6 },
        { step: 'members', start: 9, end: 9 },
      ],
      'pl',
    )
    expect(srt).toBe(
      `1\n00:00:01,000 --> 00:00:05,000\n${CAPTIONS.pl.timesheet}\n\n` +
        `2\n00:00:05,000 --> 00:00:09,000\n${CAPTIONS.pl.reports}\n`,
    )
  })
})

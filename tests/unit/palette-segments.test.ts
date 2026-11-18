import { describe, expect, it } from 'vitest'
import { PALETTE_IDS, PALETTES } from '../../src/palettes'

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((index) => {
    const value = parseInt(hex.slice(index, index + 2), 16) / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (light + 0.05) / (dark + 0.05)
}

// The dashboard day timeline draws billable segments solid, outlines non-billable ones in the billable colour and
// running ones in `runningEdge`. Each of those must reach 3:1 against the track (WCAG 1.4.11 Non-text Contrast).
describe.each(PALETTE_IDS)('%s timeline segments', (id) => {
  const { track, segment } = PALETTES[id].app

  it('draws billable fills and non-billable outlines at 3:1 against the track', () => {
    expect(contrast(segment.billable, track)).toBeGreaterThanOrEqual(3)
  })

  it('outlines running segments at 3:1 against the track', () => {
    expect(contrast(segment.runningEdge, track)).toBeGreaterThanOrEqual(3)
  })
})

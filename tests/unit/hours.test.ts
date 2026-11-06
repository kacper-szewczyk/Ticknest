import { describe, expect, it } from 'vitest'
import { ESTIMATE_HOURS, formatHoursInput, parseHoursInput } from '../../src/lib/hours'

describe('parseHoursInput', () => {
  it('reads decimal hours with a dot or a comma', () => {
    expect(parseHoursInput('8')).toBe(480)
    expect(parseHoursInput('7.5')).toBe(450)
    expect(parseHoursInput('7,25')).toBe(435)
    expect(parseHoursInput('.5')).toBe(30)
    expect(parseHoursInput('8.')).toBe(480)
  })

  it('reads H:MM', () => {
    expect(parseHoursInput('7:30')).toBe(450)
    expect(parseHoursInput('0:05')).toBe(5)
    expect(parseHoursInput('24:00')).toBe(1440)
  })

  it('rounds decimal hours to the nearest minute', () => {
    expect(parseHoursInput('1.333')).toBe(80)
  })

  it('treats a blank field as zero', () => {
    expect(parseHoursInput('')).toBe(0)
    expect(parseHoursInput('  ')).toBe(0)
  })

  it('rejects other text', () => {
    for (const text of ['abc', '7:5', '7:60', '-1', '7h', '1.2.3', '100']) expect(parseHoursInput(text)).toBeNull()
  })

  it('allows more hour digits when asked, for estimates', () => {
    expect(parseHoursInput('100', ESTIMATE_HOURS)).toBe(6000)
    expect(parseHoursInput('120:30', ESTIMATE_HOURS)).toBe(7230)
    expect(parseHoursInput('9999:59', ESTIMATE_HOURS)).toBe(599999)
    expect(parseHoursInput('10000', ESTIMATE_HOURS)).toBeNull()
    expect(parseHoursInput('10000:00', ESTIMATE_HOURS)).toBeNull()
  })
})

describe('formatHoursInput', () => {
  it('formats minutes as H:MM and leaves zero blank', () => {
    expect(formatHoursInput(450)).toBe('7:30')
    expect(formatHoursInput(5)).toBe('0:05')
    expect(formatHoursInput(0)).toBe('')
    expect(formatHoursInput(7230)).toBe('120:30')
  })

  it('round-trips with parseHoursInput', () => {
    for (const minutes of [1, 59, 60, 450, 1440]) expect(parseHoursInput(formatHoursInput(minutes))).toBe(minutes)
    for (const minutes of [6000, 599999]) {
      expect(parseHoursInput(formatHoursInput(minutes), ESTIMATE_HOURS)).toBe(minutes)
    }
  })
})

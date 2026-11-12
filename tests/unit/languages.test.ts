import { describe, expect, it } from 'vitest'
import { detectLanguage, isAppLanguage } from '../../src/i18n/languages'

describe('detectLanguage', () => {
  it.each<[string[], string]>([
    [['pl-PL', 'en-US'], 'pl'],
    [['es-MX'], 'es'],
    [['ES'], 'es'],
    [['de-DE', 'es-ES', 'pl'], 'es'],
    [['de-DE', 'fr'], 'en'],
    [[], 'en'],
  ])('picks %j as %s', (preferred, expected) => {
    expect(detectLanguage(preferred)).toBe(expected)
  })
})

describe('isAppLanguage', () => {
  it('accepts only supported language codes', () => {
    expect(isAppLanguage('pl')).toBe(true)
    expect(isAppLanguage('pl-PL')).toBe(false)
    expect(isAppLanguage('de')).toBe(false)
    expect(isAppLanguage(undefined)).toBe(false)
  })
})

// Fails CI when a translation catalog drifts from the English source catalog.
import { describe, expect, it } from 'vitest'
import en from '../../src/locales/en.json'
import es from '../../src/locales/es.json'
import pl from '../../src/locales/pl.json'

type Catalog = { [key: string]: string | Catalog }

const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/

function flatten(catalog: Catalog, prefix = ''): Map<string, string> {
  const entries = new Map<string, string>()
  for (const [key, value] of Object.entries(catalog)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof value === 'string') entries.set(path, value)
    else for (const [nested, text] of flatten(value, path)) entries.set(nested, text)
  }
  return entries
}

/** Groups plural forms (`key_one`, `key_few`, …) under their base key; other keys map to themselves. */
function baseKeys(entries: Map<string, string>): Map<string, Set<string>> {
  const bases = new Map<string, Set<string>>()
  for (const key of entries.keys()) {
    const match = PLURAL_SUFFIX.exec(key)
    const base = match ? key.slice(0, match.index) : key
    const forms = bases.get(base) ?? new Set<string>()
    if (match?.[1]) forms.add(match[1])
    bases.set(base, forms)
  }
  return bases
}

function placeholders(text: string): string[] {
  return [...text.matchAll(/\{\{\s*([\w.]+)[^}]*\}\}/g)].map((match) => match[1]!).sort()
}

function tags(text: string): string[] {
  return [...text.matchAll(/<\/?(\w+)>/g)].map((match) => match[0]).sort()
}

const source = flatten(en)
const sourceBases = baseKeys(source)

describe.each([
  ['es', es],
  ['pl', pl],
])('the %s catalog', (language, catalog) => {
  const target = flatten(catalog as Catalog)
  const targetBases = baseKeys(target)
  const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories

  it('has every key the English catalog has, and no others', () => {
    expect([...targetBases.keys()].sort()).toEqual([...sourceBases.keys()].sort())
  })

  it("has every plural form the language's plural rules use", () => {
    for (const [base, forms] of sourceBases) {
      if (forms.size === 0) continue
      const targetForms = targetBases.get(base) ?? new Set()
      for (const category of categories) expect(targetForms, `${base}_${category}`).toContain(category)
    }
  })

  it('keeps the same placeholders and markup as English', () => {
    for (const [key, text] of target) {
      const base = key.replace(PLURAL_SUFFIX, '')
      const english = source.get(key) ?? source.get(`${base}_other`) ?? ''
      expect(placeholders(text), key).toEqual(placeholders(english))
      expect(tags(text), key).toEqual(tags(english))
    }
  })

  it('has no empty translations', () => {
    for (const [key, text] of target) expect(text.trim(), key).not.toBe('')
  })
})

describe('Polish wording', () => {
  it('avoids "ewidencja czasu pracy", which has a specific meaning under the Polish Labour Code', () => {
    for (const [key, text] of flatten(pl)) expect(text.toLowerCase(), key).not.toContain('ewidencj')
  })
})

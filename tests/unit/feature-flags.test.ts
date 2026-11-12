import { afterEach, describe, expect, it, vi } from 'vitest'
import { isFeatureEnabled } from '../../src/lib/featureFlags'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('isFeatureEnabled', () => {
  it('keeps budgets when the flag is empty', () => {
    vi.stubEnv('VITE_FEATURE_BUDGETS_ENABLED', '')
    expect(isFeatureEnabled('budgets')).toBe(true)
  })

  it('keeps budgets for true and any value other than false', () => {
    vi.stubEnv('VITE_FEATURE_BUDGETS_ENABLED', 'true')
    expect(isFeatureEnabled('budgets')).toBe(true)
    vi.stubEnv('VITE_FEATURE_BUDGETS_ENABLED', '0')
    expect(isFeatureEnabled('budgets')).toBe(true)
  })

  it('turns budgets off only for false', () => {
    vi.stubEnv('VITE_FEATURE_BUDGETS_ENABLED', 'false')
    expect(isFeatureEnabled('budgets')).toBe(false)
  })
})

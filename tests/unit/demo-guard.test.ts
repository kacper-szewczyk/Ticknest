import { describe, expect, it } from 'vitest'
import { checkDemoGuard } from '../../functions/src/demo/guard'

describe('checkDemoGuard', () => {
  it('blocks the reset when demo mode is disabled', () => {
    expect(
      checkDemoGuard({ demoMode: false, demoProjectId: 'ticknest-demo', runtimeProjectId: 'ticknest-demo' }),
    ).toEqual({ allowed: false, reason: 'DEMO_MODE is not enabled.' })
  })

  it('blocks the reset when DEMO_PROJECT_ID is empty', () => {
    const result = checkDemoGuard({ demoMode: true, demoProjectId: '  ', runtimeProjectId: 'ticknest-demo' })
    expect(result.allowed).toBe(false)
  })

  it('blocks the reset when the runtime project is unknown', () => {
    const result = checkDemoGuard({ demoMode: true, demoProjectId: 'ticknest-demo', runtimeProjectId: undefined })
    expect(result.allowed).toBe(false)
  })

  it('blocks the reset when the project IDs do not match', () => {
    const result = checkDemoGuard({ demoMode: true, demoProjectId: 'ticknest-demo', runtimeProjectId: 'ticknest-prod' })
    expect(result).toEqual({
      allowed: false,
      reason: 'DEMO_PROJECT_ID (ticknest-demo) does not match the runtime project (ticknest-prod).',
    })
  })

  it('allows the reset when demo mode is enabled for the matching project', () => {
    expect(
      checkDemoGuard({ demoMode: true, demoProjectId: 'ticknest-demo', runtimeProjectId: 'ticknest-demo' }),
    ).toEqual({ allowed: true })
  })
})

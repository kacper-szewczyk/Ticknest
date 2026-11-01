// Decides whether the destructive demo reset may run. Kept free of Firebase imports so it can be unit-tested.

export type DemoGuardInput = {
  /** Value of the DEMO_MODE param. */
  demoMode: boolean
  /** Value of the DEMO_PROJECT_ID param: the only project the reset may wipe. */
  demoProjectId: string
  /** Project the function is actually running in. */
  runtimeProjectId: string | undefined
}

export type DemoGuardResult = { allowed: true } | { allowed: false; reason: string }

export function checkDemoGuard({ demoMode, demoProjectId, runtimeProjectId }: DemoGuardInput): DemoGuardResult {
  if (!demoMode) {
    return { allowed: false, reason: 'DEMO_MODE is not enabled.' }
  }
  const expected = demoProjectId.trim()
  if (!expected) {
    return { allowed: false, reason: 'DEMO_MODE is enabled but DEMO_PROJECT_ID is empty.' }
  }
  const actual = runtimeProjectId?.trim()
  if (!actual) {
    return { allowed: false, reason: 'The runtime project ID is unknown.' }
  }
  if (actual !== expected) {
    return {
      allowed: false,
      reason: `DEMO_PROJECT_ID (${expected}) does not match the runtime project (${actual}).`,
    }
  }
  return { allowed: true }
}

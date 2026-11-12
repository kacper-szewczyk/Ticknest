/**
 * Build-time switches for whole features. Each flag has a default: a default-on feature is turned off only by
 * `false`, and a default-off feature is turned on only by `true`, so deployments that set nothing keep today's
 * behaviour. Read flags only through this module, not `import.meta.env`.
 */
export type Feature = 'budgets' | 'timeOff'

type Flag = { defaultEnabled: boolean; value: () => string | undefined }

// Each variable is spelled out so Vite can replace it at build time.
const FLAGS: Record<Feature, Flag> = {
  budgets: { defaultEnabled: true, value: () => import.meta.env.VITE_FEATURE_BUDGETS_ENABLED },
  timeOff: { defaultEnabled: false, value: () => import.meta.env.VITE_FEATURE_TIME_OFF_ENABLED },
}

export function isFeatureEnabled(feature: Feature): boolean {
  const flag = FLAGS[feature]
  return flag.defaultEnabled ? flag.value() !== 'false' : flag.value() === 'true'
}

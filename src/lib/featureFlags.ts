/**
 * Build-time switches for whole features. Each feature is on unless the build sets its variable to `false`, so
 * deployments that set nothing keep every feature. Read flags only through this module, not `import.meta.env`.
 */
export type Feature = 'budgets'

// Each variable is spelled out so Vite can replace it at build time.
const FLAG_VALUES: Record<Feature, () => string | undefined> = {
  budgets: () => import.meta.env.VITE_FEATURE_BUDGETS_ENABLED,
}

export function isFeatureEnabled(feature: Feature): boolean {
  return FLAG_VALUES[feature]() !== 'false'
}

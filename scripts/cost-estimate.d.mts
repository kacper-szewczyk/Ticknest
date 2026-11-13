// Types for scripts/cost-estimate.mjs, so the unit tests can import it.
type Usage = { reads: number; writes: number; deletes: number; ruleReads: number }
type Operations = { reads: number; writes: number; deletes: number }
type Region = 'europe-west1' | 'us-central1'
export type MeasuredUsage = {
  measuredOn: string
  roles: Record<'member' | 'manager', Record<string, Usage>>
}
export type MonthEstimate = { workday: Operations; idleDay: Operations; month: Operations; entriesPerMonth: number }

export const PRICES_CHECKED_ON: string
export const FIRESTORE_PRICES: Record<Region, Operations & { storageGiBMonth: number }>
export const FIRESTORE_FREE: { readsPerDay: number; writesPerDay: number; deletesPerDay: number; storageGiB: number }
export const WORKDAY: {
  appOpens: number
  timerEntries: number
  manualEntries: number
  memberReportViews: number
  managerReportViews: number
  timerHours: number
}
export const WORKDAYS_PER_MONTH: number
export const DAYS_PER_MONTH: number
export const MEASURED_TEAM_SIZE: number
export function estimateMonth(measured: MeasuredUsage, team: { teamSize: number; seeAll: number }): MonthEstimate
export function priceMonth(estimate: MonthEstimate, region: Region): { withFreeQuota: number; withoutFreeQuota: number }
export function renderTables(measured: MeasuredUsage): string

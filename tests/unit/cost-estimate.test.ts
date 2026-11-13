import { describe, expect, it } from 'vitest'
import {
  DAYS_PER_MONTH,
  estimateMonth,
  priceMonth,
  renderTables,
  WORKDAYS_PER_MONTH,
  type MeasuredUsage,
} from '../../scripts/cost-estimate.mjs'
import measuredUsage from '../../docs/costs/firestore-usage.json'

const none = { reads: 0, writes: 0, deletes: 0, ruleReads: 0 }
const actions = (overrides: Record<string, Partial<typeof none>>) =>
  Object.fromEntries(
    ['openApp', 'timer', 'manualEntry', 'openReports', 'teammateTimer'].map((name) => [
      name,
      { ...none, ...overrides[name] },
    ]),
  )

describe('estimateMonth', () => {
  it('adds the code-derived reads even when nothing was measured', () => {
    const measured: MeasuredUsage = { measuredOn: '2026-11-13', roles: { member: actions({}), manager: actions({}) } }
    const { workday, idleDay, month } = estimateMonth(measured, { teamSize: 1, seeAll: 0 })

    // 4 timers × 6 catalog rule reads, 1 manual entry × 7 Function reads, and the auto-stop runs.
    const autoStop = 96 * (1 + (3 * 7) / 24)
    expect(workday.reads).toBeCloseTo(24 + 7 + autoStop)
    expect(workday.writes).toBe(2)
    expect(idleDay.reads).toBe(96)
    expect(month.reads).toBeCloseTo(workday.reads * WORKDAYS_PER_MONTH + 96 * (DAYS_PER_MONTH - WORKDAYS_PER_MONTH))
  })

  it("scales an owner's or manager's report with the team, but not a member's", () => {
    const measured: MeasuredUsage = {
      measuredOn: '2026-11-13',
      roles: { member: actions({ openReports: { reads: 100 } }), manager: actions({ openReports: { reads: 500 } }) },
    }
    const small = estimateMonth(measured, { teamSize: 5, seeAll: 1 }).workday.reads
    const large = estimateMonth(measured, { teamSize: 10, seeAll: 1 }).workday.reads
    const autoStopDifference = 96 * 3 * ((5 * 7) / 24)
    // 5 more members viewing 0.2 reports of 100 reads, and the manager's daily report doubling from 500 to 1,000.
    expect(large - small).toBeCloseTo(5 * 0.2 * 100 + 500 + 5 * 31 + autoStopDifference)
  })
})

describe('priceMonth', () => {
  const estimate = (reads: number) => ({
    workday: { reads, writes: 0, deletes: 0 },
    idleDay: { reads: 0, writes: 0, deletes: 0 },
    month: { reads: reads * WORKDAYS_PER_MONTH, writes: 0, deletes: 0 },
    entriesPerMonth: 0,
  })

  it('is free within the daily quota', () => {
    expect(priceMonth(estimate(50_000), 'europe-west1').withFreeQuota).toBe(0)
  })

  it('bills only the reads above the daily quota', () => {
    const price = priceMonth(estimate(150_000), 'europe-west1')
    expect(price.withFreeQuota).toBeCloseTo(0.033 * WORKDAYS_PER_MONTH)
    expect(price.withoutFreeQuota).toBeCloseTo(0.033 * 1.5 * WORKDAYS_PER_MONTH)
  })
})

describe('renderTables', () => {
  it('renders the committed measurement for both regions', () => {
    const tables = renderTables(measuredUsage as MeasuredUsage)
    expect(tables).toContain(`Measured ${measuredUsage.measuredOn}`)
    expect(tables).toContain('| europe-west1, within the free quota |')
    expect(tables).toContain('| us-central1, no free quota |')
  })
})

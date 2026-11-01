import type { Budget } from './budgets'
import { budgetTargetKey } from './budgetForm'
import { type BudgetProgress, budgetInstantRange, groupBudgets } from './budgetProgress'

export type TeamBudgetFilters = {
  userId: string
  /** A target key from `budgetTargetKey`, or empty for every target. */
  targetKey: string
  /** Inclusive `YYYY-MM-DD` window; a target group is shown when one of its budgets overlaps it. Empty is open. */
  fromDay: string
  toDay: string
}

/** Behind is a negative running balance, over a positive one. */
export type TeamBudgetStatus = 'behind' | 'on-track' | 'over'

export function teamBudgetStatus(progress: Pick<BudgetProgress, 'balanceMinutes'>): TeamBudgetStatus {
  if (progress.balanceMinutes < 0) return 'behind'
  return progress.balanceMinutes > 0 ? 'over' : 'on-track'
}

/**
 * Groups active budgets by member and target, as the member's own view does, and keeps the groups that match
 * the filters. Whole groups are kept so the numbers match what the member sees. Ordered by member, then target.
 */
export function teamBudgetGroups(budgets: Budget[], filters: TeamBudgetFilters): Budget[][] {
  return groupBudgets(budgets)
    .filter((group) => !filters.userId || group[0].userId === filters.userId)
    .filter((group) => !filters.targetKey || budgetTargetKey(group[0].target) === filters.targetKey)
    .filter((group) =>
      group.some(
        (budget) =>
          (!filters.fromDay || budget.endDay >= filters.fromDay) &&
          (!filters.toDay || budget.startDay <= filters.toDay),
      ),
    )
    .sort(
      (a, b) =>
        a[0].userDisplayName.localeCompare(b[0].userDisplayName) ||
        a[0].userId.localeCompare(b[0].userId) ||
        a[0].target.name.localeCompare(b[0].target.name),
    )
}

/**
 * Returns, per member, the instants that bound every day of their shown budget groups, so each member's entries
 * are read with one query bounded by their budgets instead of their full history.
 */
export function teamEntryRanges(
  groups: Budget[][],
  timeZoneFor: (userId: string) => string,
): Map<string, [number, number]> {
  const ranges = new Map<string, [number, number]>()
  for (const group of groups) {
    const userId = group[0].userId
    const [start, end] = budgetInstantRange(group, timeZoneFor(userId)).map((date) => date.getTime())
    const current = ranges.get(userId)
    ranges.set(userId, current ? [Math.min(current[0], start), Math.max(current[1], end)] : [start, end])
  }
  return ranges
}

import { collection, onSnapshot, query, where, type QueryConstraint, type Unsubscribe } from 'firebase/firestore'
import { validateBudgetInput, type WEEKDAYS } from './budgetValidation'
import { callFunction, db } from './firebase'

export type Weekday = (typeof WEEKDAYS)[number]
export type WeekdayMinutes = Record<Weekday, number>

export type BudgetTargetType = 'project' | 'client'
export type BudgetTarget = { type: BudgetTargetType; id: string; name: string }

/** A target number of minutes a member should log on a project or client on each weekday of a date range. */
export type Budget = {
  id: string
  userId: string
  /** Display snapshot of the tracked member, kept after they are removed. */
  userDisplayName: string
  /** The name is a display snapshot, kept after the project or client is archived. */
  target: BudgetTarget
  /** Inclusive local calendar dates (`YYYY-MM-DD`) in the tracked user's timezone. */
  startDay: string
  endDay: string
  weekdayMinutes: WeekdayMinutes
  /** Sorted `YYYY-MM-DD` dates inside the range with a zero target. */
  exceptions: string[]
  /** Archived budgets drop out of progress; only archived budgets can be deleted. */
  archived: boolean
  createdBy: string
  createdAt: unknown
  updatedAt: unknown
}

export type BudgetInput = {
  userId: string
  target: { type: BudgetTargetType; id: string }
  startDay: string
  endDay: string
  weekdayMinutes: WeekdayMinutes
  exceptions: string[]
}

type SaveBudgetRequest = BudgetInput & { workspaceId: string; budgetId: string | null }

/**
 * Subscribes to workspace budgets. Members must pass their own `userId`; owners and managers may omit it to
 * read everyone's. `activeOnDay` keeps budgets that end on or after that day.
 */
export function subscribeToBudgets(
  workspaceId: string,
  filter: { userId?: string; activeOnDay?: string },
  onChange: (budgets: Budget[]) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  const constraints: QueryConstraint[] = []
  if (filter.userId) constraints.push(where('userId', '==', filter.userId))
  if (filter.activeOnDay) constraints.push(where('endDay', '>=', filter.activeOnDay))
  return onSnapshot(
    query(collection(db, 'workspaces', workspaceId, 'budgets'), ...constraints),
    (snapshot) => onChange(snapshot.docs.map((item) => ({ id: item.id, ...item.data() }) as Budget)),
    onError,
  )
}

export async function saveBudget(workspaceId: string, input: BudgetInput, budgetId?: string): Promise<string> {
  validateBudgetInput(input)
  const { budgetId: savedBudgetId } = await callFunction<SaveBudgetRequest, { budgetId: string }>('saveBudget', {
    workspaceId,
    budgetId: budgetId ?? null,
    userId: input.userId,
    target: { type: input.target.type, id: input.target.id },
    startDay: input.startDay,
    endDay: input.endDay,
    weekdayMinutes: input.weekdayMinutes,
    exceptions: input.exceptions,
  })
  return savedBudgetId
}

export async function setBudgetArchived(workspaceId: string, budgetId: string, archived: boolean): Promise<void> {
  await callFunction<{ workspaceId: string; budgetId: string; archived: boolean }, { budgetId: string }>(
    'setBudgetArchived',
    { workspaceId, budgetId, archived },
  )
}

/** Permanently deletes an archived budget. */
export async function deleteBudget(workspaceId: string, budgetId: string): Promise<void> {
  await callFunction<{ workspaceId: string; budgetId: string }, { budgetId: string }>('deleteBudget', {
    workspaceId,
    budgetId,
  })
}

// `npm run cost:estimate`: turns the measured Firestore usage per action (docs/costs/firestore-usage.json, written
// by `npm run measure:costs`) into a monthly estimate for a team, using the workday assumptions and prices below.
// It prints the Markdown tables used in docs/operations.md#costs.
//
//   node scripts/cost-estimate.mjs [--usage docs/costs/firestore-usage.json]
//
// This is an estimate, not a quote. Prices were copied from the pages below on PRICES_CHECKED_ON; check them again
// before you rely on the numbers.
import { readFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export const PRICES_CHECKED_ON = '2026-11-13'

/**
 * Firestore Standard edition, USD per 100,000 operations and per GiB-month, from
 * https://cloud.google.com/firestore/pricing.
 */
export const FIRESTORE_PRICES = {
  'europe-west1': { reads: 0.033, writes: 0.099, deletes: 0.011, storageGiBMonth: 0.165 },
  'us-central1': { reads: 0.03, writes: 0.09, deletes: 0.01, storageGiBMonth: 0.15 },
}

/** The no-cost Firestore quota of a project's default database: daily for operations, total for storage. */
export const FIRESTORE_FREE = { readsPerDay: 50_000, writesPerDay: 20_000, deletesPerDay: 20_000, storageGiB: 1 }

/** How a team uses the app on one workday, per person. Change these to fit your team. */
export const WORKDAY = {
  /** App opens a day: first thing, after lunch, and one reconnect (listeners are re-billed on every reconnect). */
  appOpens: 3,
  /** Entries tracked with the timer. */
  timerEntries: 4,
  /** Entries added by hand. */
  manualEntries: 1,
  /** Report views; members look once a week, owners and managers every day. */
  memberReportViews: 0.2,
  managerReportViews: 1,
  /** Hours a member's timer runs, which the 15-minute auto-stop check reads. */
  timerHours: 7,
}

export const WORKDAYS_PER_MONTH = 21
export const DAYS_PER_MONTH = 30
/** The measured team: the seeded demo workspace has 5 people, 2 of whom (owner and manager) see everyone's entries. */
export const MEASURED_TEAM_SIZE = 5

// Not seen by the browser counter, so taken from the code:
// - Timer entries name a client, project and task, which the entry rules read on start and on stop (firestore.rules).
const CATALOG_RULE_READS_PER_TIMER = 6
// - A manual entry is saved by the saveManualTimeEntry Function (functions/src/index.ts): it reads the caller, the
//   client, project and task, the user's lock and running timer, and the overlap query (at least one read), then
//   writes the lock and the entry.
const MANUAL_ENTRY_SERVER = { reads: 7, writes: 2 }
// - autoStopTimers runs every 15 minutes (functions/src/timers/autoStop.ts): one query (at least one read) plus two
//   reads per running timer it checks.
const AUTO_STOP_RUNS_PER_DAY = 96

/** @typedef {{ reads: number, writes: number, deletes: number, ruleReads: number }} Usage */

/**
 * Billed Firestore operations for one month of a team of `teamSize` with `seeAll` owners and managers.
 * @param {{ roles: Record<'member' | 'manager', Record<string, Usage>> }} measured
 */
export function estimateMonth(measured, { teamSize, seeAll }) {
  const members = teamSize - seeAll
  const workday = { reads: 0, writes: 0, deletes: 0 }
  const add = (usage, times, readScale = 1) => {
    workday.reads += times * ((usage.reads ?? 0) * readScale + (usage.ruleReads ?? 0))
    workday.writes += times * (usage.writes ?? 0)
    workday.deletes += times * (usage.deletes ?? 0)
  }

  for (const [role, people] of [
    ['member', members],
    ['manager', seeAll],
  ]) {
    const usage = measured.roles[role]
    add(usage.openApp, people * WORKDAY.appOpens)
    add(usage.timer, people * WORKDAY.timerEntries)
    workday.reads += people * WORKDAY.timerEntries * CATALOG_RULE_READS_PER_TIMER
    add(usage.manualEntry, people * WORKDAY.manualEntries)
    workday.reads += people * WORKDAY.manualEntries * MANUAL_ENTRY_SERVER.reads
    workday.writes += people * WORKDAY.manualEntries * MANUAL_ENTRY_SERVER.writes
    // An owner's or manager's report reads everyone's entries, so it grows with the team.
    const reportScale = role === 'manager' ? teamSize / MEASURED_TEAM_SIZE : 1
    add(
      usage.openReports,
      people * (role === 'manager' ? WORKDAY.managerReportViews : WORKDAY.memberReportViews),
      reportScale,
    )
    // Teammates' timers, as seen by everyone who has the Timesheet open.
    add(usage.teammateTimer ?? {}, people * (teamSize - 1) * WORKDAY.timerEntries)
  }

  // Auto-stop: one read per run, plus two per timer running at the time, on average teamSize × timerHours / 24.
  const runningAtOnce = (teamSize * WORKDAY.timerHours) / 24
  const autoStopWorkday = AUTO_STOP_RUNS_PER_DAY * (1 + 3 * runningAtOnce)
  const autoStopIdleDay = AUTO_STOP_RUNS_PER_DAY
  workday.reads += autoStopWorkday

  const idleDays = DAYS_PER_MONTH - WORKDAYS_PER_MONTH
  const month = {
    reads: workday.reads * WORKDAYS_PER_MONTH + autoStopIdleDay * idleDays,
    writes: workday.writes * WORKDAYS_PER_MONTH,
    deletes: workday.deletes * WORKDAYS_PER_MONTH,
  }
  const entriesPerMonth = teamSize * (WORKDAY.timerEntries + WORKDAY.manualEntries) * WORKDAYS_PER_MONTH
  return { workday, idleDay: { reads: autoStopIdleDay, writes: 0, deletes: 0 }, month, entriesPerMonth }
}

/** USD for a month, with and without the default database's daily free quota. */
export function priceMonth(estimate, region) {
  const price = FIRESTORE_PRICES[region]
  const billable = (perDay, free, days) => Math.max(0, perDay - free) * days
  const idleDays = DAYS_PER_MONTH - WORKDAYS_PER_MONTH
  const cost = (reads, writes, deletes) =>
    (reads * price.reads + writes * price.writes + deletes * price.deletes) / 100_000
  const { workday, idleDay, month } = estimate
  return {
    withFreeQuota: cost(
      billable(workday.reads, FIRESTORE_FREE.readsPerDay, WORKDAYS_PER_MONTH) +
        billable(idleDay.reads, FIRESTORE_FREE.readsPerDay, idleDays),
      billable(workday.writes, FIRESTORE_FREE.writesPerDay, WORKDAYS_PER_MONTH),
      billable(workday.deletes, FIRESTORE_FREE.deletesPerDay, WORKDAYS_PER_MONTH),
    ),
    withoutFreeQuota: cost(month.reads, month.writes, month.deletes),
  }
}

const SCENARIOS = [
  { name: '5 people', teamSize: 5, seeAll: 2 },
  { name: '25 people', teamSize: 25, seeAll: 3 },
]

const number = (value) => Math.round(value).toLocaleString('en-US')
const percent = (value, of) => `${Math.round((value / of) * 100)}%`
const usd = (value) => (value < 0.005 ? '$0.00' : `$${value.toFixed(2)}`)

export function renderTables(measured) {
  const rows = SCENARIOS.map((scenario) => ({ scenario, estimate: estimateMonth(measured, scenario) }))
  const lines = [
    `Measured ${measured.measuredOn}; prices checked ${PRICES_CHECKED_ON}.`,
    '',
    '| Firestore, per workday | ' + rows.map((row) => row.scenario.name).join(' | ') + ' | Free quota per day |',
    '| --- | ' + rows.map(() => '---:').join(' | ') + ' | ---: |',
  ]
  for (const [label, key, free] of [
    ['Document reads', 'reads', FIRESTORE_FREE.readsPerDay],
    ['Document writes', 'writes', FIRESTORE_FREE.writesPerDay],
    ['Document deletes', 'deletes', FIRESTORE_FREE.deletesPerDay],
  ]) {
    const cells = rows.map(
      ({ estimate }) => `${number(estimate.workday[key])} (${percent(estimate.workday[key], free)})`,
    )
    lines.push(`| ${label} | ${cells.join(' | ')} | ${number(free)} |`)
  }
  lines.push('', '| Firestore, per month (USD) | ' + rows.map((row) => row.scenario.name).join(' | ') + ' |')
  lines.push('| --- | ' + rows.map(() => '---:').join(' | ') + ' |')
  for (const region of Object.keys(FIRESTORE_PRICES)) {
    const prices = rows.map(({ estimate }) => priceMonth(estimate, region))
    lines.push(`| ${region}, within the free quota | ${prices.map((price) => usd(price.withFreeQuota)).join(' | ')} |`)
    lines.push(`| ${region}, no free quota | ${prices.map((price) => usd(price.withoutFreeQuota)).join(' | ')} |`)
  }
  lines.push(
    '',
    `New time entries per month: ${rows.map((row) => `${row.scenario.name} ${number(row.estimate.entriesPerMonth)}`).join(', ')}.`,
  )
  return lines.join('\n')
}

async function main() {
  const { values } = parseArgs({ options: { usage: { type: 'string', default: 'docs/costs/firestore-usage.json' } } })
  const measured = JSON.parse(await readFile(values.usage, 'utf8'))
  console.log(renderTables(measured))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}

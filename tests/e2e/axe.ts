import AxeBuilder from '@axe-core/playwright'
import { expect, type Page } from '@playwright/test'

type Result = Awaited<ReturnType<AxeBuilder['analyze']>>['violations'][number]

/** The WCAG levels the scan checks: A and AA, up to WCAG 2.2. */
const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

/**
 * A violation that is already known and tracked, so the scan does not fail on it. Each entry names one axe rule and
 * one CSS selector. A node is skipped only when both match, so a new violation of the same rule elsewhere still
 * fails. Every entry links the issue or PR that fixes it: remove the entry when that lands.
 */
type KnownViolation = { rule: string; selector: string; issue: string }

const KNOWN_VIOLATIONS: KnownViolation[] = [
  // The "Tickness vX" version line in the sidebar footer (`app.sidebar.faint`) is about 3:1, below 4.5:1.
  {
    rule: 'color-contrast',
    selector: ':is(aside, .MuiDrawer-paper) .MuiTypography-caption',
    issue: 'https://github.com/kacper-szewczyk/Ticknest/issues/301',
  },
]

function isKnown(rule: string, page: Page, target: string): Promise<boolean> {
  const selectors = KNOWN_VIOLATIONS.filter((known) => known.rule === rule).map((known) => known.selector)
  if (selectors.length === 0) return Promise.resolve(false)
  return page.evaluate(
    (args) => {
      const node = document.querySelector(args.target)
      return Boolean(node && args.selectors.some((selector) => node.closest(selector)))
    },
    { target, selectors },
  )
}

function describeViolations(violations: Result[]): string {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .map((node) => `    ${node.target.join(' ')}\n      ${node.failureSummary?.replaceAll('\n', '\n      ')}`)
        .join('\n')
      return `${violation.id} (${violation.impact}): ${violation.help}\n  ${violation.helpUrl}\n${nodes}`
    })
    .join('\n\n')
}

/**
 * Runs axe on the whole page and fails on any WCAG 2.2 A or AA violation that is not in `KNOWN_VIOLATIONS`.
 * `name` labels the scan in the failure message, e.g. "Reports (forest-night)".
 */
export async function expectNoAxeViolations(page: Page, name: string): Promise<void> {
  // Wait for open menus, dialogs and drawers to finish their transitions, so colours are final.
  // Scan the resting state: move the pointer off any control a click left it hovering.
  await page.mouse.move(0, 0)
  // Endless ones (spinners) never finish, and cancelled ones reject, so wait only for the finite ones to settle.
  await page.evaluate(() =>
    Promise.allSettled(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished),
    ),
  )
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze()

  const unknown: Result[] = []
  for (const violation of results.violations) {
    const nodes = []
    for (const node of violation.nodes) {
      // A target is a list only inside iframes or shadow roots, which the app does not use.
      const target = node.target.join(' ')
      if (!(await isKnown(violation.id, page, target))) nodes.push(node)
    }
    if (nodes.length > 0) unknown.push({ ...violation, nodes })
  }

  expect(unknown, `Accessibility violations on ${name}:\n\n${describeViolations(unknown)}`).toEqual([])
}

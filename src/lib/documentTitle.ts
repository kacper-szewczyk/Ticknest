// The browser tab title has two owners: the current view sets the page title ("Reports · Acme · Ticknest") and a
// running timer temporarily replaces it. Keeping both here means stopping the timer shows the title of the view
// the user is on now, not the one they were on when it started.

let pageTitle: string | null = null
let timerTitle: string | null = null
// The title from before either owner set one (index.html's), restored once both are cleared.
let originalTitle: string | null = null

function apply() {
  const next = timerTitle ?? pageTitle
  if (next === null) {
    if (originalTitle !== null) document.title = originalTitle
    originalTitle = null
    return
  }
  if (originalTitle === null) originalTitle = document.title
  document.title = next
}

/** Sets the current view's title, or `null` to go back to the original one. */
export function setPageTitle(title: string | null): void {
  pageTitle = title
  apply()
}

/** Shows a running timer in place of the page title, or `null` when no timer runs. */
export function setTimerTitle(title: string | null): void {
  timerTitle = title
  apply()
}

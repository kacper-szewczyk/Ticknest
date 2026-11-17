import { useEffect, type RefObject } from 'react'

const HEADING_WAIT_MS = 10_000

/**
 * Moves keyboard focus to the view's h1 inside `main` whenever `navigationCount` changes, so a screen reader
 * announces the new page. It does nothing on first load (`navigationCount` 0). A lazy-loaded view has no heading
 * yet, so focus goes to `main` (which needs `tabIndex={-1}`) and moves on to the heading once it renders.
 */
export function useFocusViewHeading(mainRef: RefObject<HTMLElement | null>, navigationCount: number): void {
  useEffect(() => {
    const main = mainRef.current
    if (navigationCount === 0 || !main) return

    const focusHeading = (): boolean => {
      const heading = main.querySelector<HTMLElement>('h1')
      if (!heading) return false
      if (!heading.hasAttribute('tabindex')) heading.tabIndex = -1
      heading.focus()
      return true
    }
    if (focusHeading()) return

    main.focus()
    const observer = new MutationObserver(() => {
      // Leave focus alone if the user has already moved on.
      if (document.activeElement !== main) return observer.disconnect()
      if (focusHeading()) observer.disconnect()
    })
    observer.observe(main, { childList: true, subtree: true })
    const timeout = window.setTimeout(() => observer.disconnect(), HEADING_WAIT_MS)
    return () => {
      observer.disconnect()
      window.clearTimeout(timeout)
    }
  }, [mainRef, navigationCount])
}

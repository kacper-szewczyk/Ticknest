const SIDEBAR_COLLAPSED_KEY = 'ticknest.sidebarCollapsed'

// Collapsing the desktop sidebar is a per-browser convenience, so storage failures (private mode,
// blocked site data) only mean the sidebar starts expanded.
export function loadSidebarCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveSidebarCollapsed(collapsed: boolean): void {
  try {
    if (collapsed) window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, 'true')
    else window.localStorage.removeItem(SIDEBAR_COLLAPSED_KEY)
  } catch {
    // See loadSidebarCollapsed.
  }
}

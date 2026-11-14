// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadSidebarCollapsed, saveSidebarCollapsed } from '../../src/lib/sidebarPreference'

const STORAGE_KEY = 'ticknest.sidebarCollapsed'

afterEach(() => {
  vi.restoreAllMocks()
  window.localStorage.clear()
})

describe('sidebar collapse preference', () => {
  it('starts expanded when nothing is stored', () => {
    expect(loadSidebarCollapsed()).toBe(false)
  })

  it('remembers a collapsed sidebar', () => {
    saveSidebarCollapsed(true)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true')
    expect(loadSidebarCollapsed()).toBe(true)
  })

  it('removes the key when the sidebar is expanded again', () => {
    saveSidebarCollapsed(true)
    saveSidebarCollapsed(false)
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull()
    expect(loadSidebarCollapsed()).toBe(false)
  })

  it('treats any stored value other than "true" as expanded', () => {
    window.localStorage.setItem(STORAGE_KEY, 'false')
    expect(loadSidebarCollapsed()).toBe(false)
  })

  it('starts expanded when reading storage throws', () => {
    window.localStorage.setItem(STORAGE_KEY, 'true')
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => loadSidebarCollapsed()).not.toThrow()
    expect(loadSidebarCollapsed()).toBe(false)
  })

  it('ignores storage failures when saving', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota')
    })
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => saveSidebarCollapsed(true)).not.toThrow()
    expect(() => saveSidebarCollapsed(false)).not.toThrow()
  })
})

import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearInviteParamsFromAddressBar,
  hasInviteParams,
  verificationContinueUrl,
  withoutInviteParams,
} from '../../src/lib/inviteLink'

const INVITE_URL = 'https://ticknest.app/?workspace=w1&invite=i1&token=secret#settings'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('hasInviteParams', () => {
  it('detects an invitation link', () => {
    expect(hasInviteParams(INVITE_URL)).toBe(true)
  })

  it('ignores ordinary app URLs', () => {
    expect(hasInviteParams('https://ticknest.app/#timesheet')).toBe(false)
    expect(hasInviteParams('https://ticknest.app/?workspace=w1')).toBe(false)
  })
})

describe('withoutInviteParams', () => {
  it('removes the workspace, invite, and token but keeps other parameters and the hash', () => {
    expect(withoutInviteParams('https://ticknest.app/?ref=mail&workspace=w1&invite=i1&token=secret#settings')).toBe(
      'https://ticknest.app/?ref=mail#settings',
    )
  })
})

describe('clearInviteParamsFromAddressBar', () => {
  function stubLocation(href: string) {
    const replaceState = vi.fn()
    vi.stubGlobal('window', { location: { href }, history: { state: { from: 'test' }, replaceState } })
    return replaceState
  }

  it('replaces the current history entry with a token-free URL', () => {
    const replaceState = stubLocation(INVITE_URL)
    clearInviteParamsFromAddressBar()
    expect(replaceState).toHaveBeenCalledWith({ from: 'test' }, '', 'https://ticknest.app/#settings')
  })

  it('leaves the history alone when there is no invitation in the URL', () => {
    const replaceState = stubLocation('https://ticknest.app/#settings')
    clearInviteParamsFromAddressBar()
    expect(replaceState).not.toHaveBeenCalled()
  })
})

describe('verificationContinueUrl', () => {
  it('returns to this page with the invitation but without the in-app hash', () => {
    expect(verificationContinueUrl(INVITE_URL)).toBe('https://ticknest.app/?workspace=w1&invite=i1&token=secret')
  })
})

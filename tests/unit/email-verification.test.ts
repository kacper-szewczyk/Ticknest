import type { User } from 'firebase/auth'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { sendEmailVerification } = vi.hoisted(() => ({ sendEmailVerification: vi.fn() }))

vi.mock('firebase/auth', async (importOriginal) => ({
  ...(await importOriginal<typeof import('firebase/auth')>()),
  sendEmailVerification,
}))
vi.mock('../../src/lib/firebase', () => ({ auth: {}, db: {} }))

const { refreshEmailVerification, sendVerificationEmail } = await import('../../src/lib/auth')

const user = {} as User

beforeEach(() => {
  vi.stubGlobal('window', { location: { href: 'https://ticknest.app/?workspace=w1&invite=i1&token=t1#settings' } })
})

afterEach(() => {
  vi.unstubAllGlobals()
  sendEmailVerification.mockReset()
})

describe('sendVerificationEmail', () => {
  it('links back to the current page, invitation included', async () => {
    sendEmailVerification.mockResolvedValue(undefined)
    await sendVerificationEmail(user)
    expect(sendEmailVerification).toHaveBeenCalledExactlyOnceWith(user, {
      url: 'https://ticknest.app/?workspace=w1&invite=i1&token=t1',
    })
  })

  it('falls back to the plain email when this domain is not an authorized return address', async () => {
    sendEmailVerification
      .mockRejectedValueOnce(Object.assign(new Error('unauthorized'), { code: 'auth/unauthorized-continue-uri' }))
      .mockResolvedValueOnce(undefined)
    await sendVerificationEmail(user)
    expect(sendEmailVerification).toHaveBeenCalledTimes(2)
    expect(sendEmailVerification).toHaveBeenLastCalledWith(user)
  })

  it('passes other errors through', async () => {
    const tooMany = Object.assign(new Error('slow down'), { code: 'auth/too-many-requests' })
    sendEmailVerification.mockRejectedValue(tooMany)
    await expect(sendVerificationEmail(user)).rejects.toBe(tooMany)
    expect(sendEmailVerification).toHaveBeenCalledTimes(1)
  })
})

describe('refreshEmailVerification', () => {
  function fakeUser(verifiedAfterReload: boolean) {
    const account = {
      emailVerified: false,
      reload: vi.fn(async () => {
        account.emailVerified = verifiedAfterReload
      }),
      getIdToken: vi.fn(async () => 'token'),
    }
    return account
  }

  it('refreshes the ID token once the email is verified, so the backend sees the new claim', async () => {
    const account = fakeUser(true)
    await expect(refreshEmailVerification(account as unknown as User)).resolves.toBe(true)
    expect(account.getIdToken).toHaveBeenCalledWith(true)
  })

  it('skips the token refresh while the email is still unverified', async () => {
    const account = fakeUser(false)
    await expect(refreshEmailVerification(account as unknown as User)).resolves.toBe(false)
    expect(account.getIdToken).not.toHaveBeenCalled()
  })
})

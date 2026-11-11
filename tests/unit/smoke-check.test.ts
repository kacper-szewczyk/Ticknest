import { describe, expect, it, vi } from 'vitest'
import { checkSite, readEntryScript, readVersion, smokeCheck } from '../../scripts/smoke-check.mjs'

const page = (version: string | null, entry = '/assets/index-abc123.js') =>
  [
    '<!doctype html><html><head>',
    version === null ? '' : `<meta name="ticknest-version" content="${version}">`,
    `<script type="module" crossorigin src="${entry}"></script>`,
    '</head><body><div id="root"></div></body></html>',
  ].join('')

const response = (status: number, body = '', contentType = 'text/html', url = '') =>
  ({
    status,
    url,
    text: async () => body,
    headers: new Headers({ 'content-type': contentType }),
  }) as Response

const site = (html: string, script = response(200, '', 'text/javascript; charset=utf-8')) =>
  vi.fn(async (url: string) => (url.endsWith('.js') ? script : response(200, html, 'text/html', url)))

describe('readVersion', () => {
  it('reads the version meta tag with either quote style or attribute order', () => {
    expect(readVersion(page('1.40.0'))).toBe('1.40.0')
    expect(readVersion(`<meta content='2.0.0' name='ticknest-version' />`)).toBe('2.0.0')
  })

  it('ignores other meta tags and returns null without the tag', () => {
    expect(readVersion('<meta name="description" content="1.0.0">')).toBeNull()
    expect(readVersion(page(null))).toBeNull()
  })
})

describe('readEntryScript', () => {
  it('returns the first module script src', () => {
    expect(readEntryScript(page('1.0.0'))).toBe('/assets/index-abc123.js')
  })

  it('skips classic scripts and returns null without a module script', () => {
    expect(readEntryScript('<script src="/legacy.js"></script>')).toBeNull()
  })
})

describe('checkSite', () => {
  it('passes for the expected version with a loadable entry script', async () => {
    const fetchImpl = site(page('1.40.0'))
    await expect(checkSite('https://example.web.app', '1.40.0', fetchImpl)).resolves.toEqual([])
    expect(fetchImpl).toHaveBeenCalledWith('https://example.web.app/assets/index-abc123.js', { cache: 'no-store' })
  })

  it('reports a non-200 page without checking further', async () => {
    const fetchImpl = vi.fn(async () => response(404))
    await expect(checkSite('https://example.web.app', '1.40.0', fetchImpl)).resolves.toEqual([
      'https://example.web.app returned HTTP 404',
    ])
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reports a stale or missing version', async () => {
    await expect(checkSite('https://example.web.app', '1.40.0', site(page('1.39.0')))).resolves.toEqual([
      'expected version 1.40.0, found 1.39.0',
    ])
    await expect(checkSite('https://example.web.app', '1.40.0', site(page(null)))).resolves.toEqual([
      'expected version 1.40.0, found no <meta name="ticknest-version">',
    ])
  })

  it('reports an entry script that is missing or served as HTML', async () => {
    const missing = site(page('1.40.0'), response(404))
    await expect(checkSite('https://example.web.app', '1.40.0', missing)).resolves.toEqual([
      'https://example.web.app/assets/index-abc123.js returned HTTP 404',
    ])
    // The SPA rewrite serves index.html for unknown paths, so a 200 alone does not prove the asset exists.
    const rewritten = site(page('1.40.0'), response(200, '<html>', 'text/html'))
    await expect(checkSite('https://example.web.app', '1.40.0', rewritten)).resolves.toEqual([
      'https://example.web.app/assets/index-abc123.js was served as text/html',
    ])
  })
})

describe('smokeCheck', () => {
  it('retries until the new version is served', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('.js')) return response(200, '', 'text/javascript')
      calls += 1
      return response(200, page(calls < 3 ? '1.39.0' : '1.40.0'))
    })
    const log = vi.fn()
    await expect(
      smokeCheck('https://example.web.app', '1.40.0', { attempts: 5, delayMs: 0, fetchImpl, log }),
    ).resolves.toEqual([])
    expect(log).toHaveBeenCalledTimes(2)
  })

  it('returns the last problems after the attempts run out, including network errors', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND')
    })
    await expect(
      smokeCheck('https://example.web.app', '1.40.0', { attempts: 2, delayMs: 0, fetchImpl, log: vi.fn() }),
    ).resolves.toEqual(['request failed: getaddrinfo ENOTFOUND'])
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })
})

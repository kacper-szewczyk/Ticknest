// Checks that a deployed site serves the expected build. Run after `firebase deploy`:
//   node scripts/smoke-check.mjs <site-url> <expected-version>
// Passes when the page returns HTTP 200, its <meta name="ticknest-version"> matches the expected
// version, and its entry script loads. Hosting can take a moment to serve a new release, so each
// failed attempt is retried before the check fails.
import { pathToFileURL } from 'node:url'

export const VERSION_META = 'ticknest-version'

/** Reads the build version from the page's <meta name="ticknest-version"> tag. */
export function readVersion(html) {
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    if (attribute(tag, 'name') === VERSION_META) return attribute(tag, 'content')
  }
  return null
}

/** Returns the src of the page's first module script, which Vite emits as the app entry. */
export function readEntryScript(html) {
  for (const [tag] of html.matchAll(/<script\b[^>]*>/gi)) {
    if (attribute(tag, 'type') === 'module') {
      const src = attribute(tag, 'src')
      if (src) return src
    }
  }
  return null
}

function attribute(tag, name) {
  const match = tag.match(new RegExp(`\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return match ? (match[1] ?? match[2] ?? match[3]) : null
}

/** Runs one check of the site and returns the problems found; an empty list means it passed. */
export async function checkSite(siteUrl, expectedVersion, fetchImpl = fetch) {
  const page = await fetchImpl(siteUrl, { cache: 'no-store', redirect: 'follow' })
  if (page.status !== 200) return [`${siteUrl} returned HTTP ${page.status}`]

  const html = await page.text()
  const problems = []
  const version = readVersion(html)
  if (version !== expectedVersion) {
    problems.push(`expected version ${expectedVersion}, found ${version ?? `no <meta name="${VERSION_META}">`}`)
  }

  const entry = readEntryScript(html)
  if (!entry) {
    problems.push('the page has no module entry script')
  } else {
    const scriptUrl = new URL(entry, page.url || siteUrl).href
    const script = await fetchImpl(scriptUrl, { cache: 'no-store' })
    const type = script.headers.get('content-type') ?? ''
    if (script.status !== 200) problems.push(`${scriptUrl} returned HTTP ${script.status}`)
    else if (!type.includes('javascript')) problems.push(`${scriptUrl} was served as ${type || 'no content type'}`)
  }
  return problems
}

/** Retries checkSite until it passes or the attempts run out; returns the last problems. */
export async function smokeCheck(
  siteUrl,
  expectedVersion,
  { attempts = 6, delayMs = 10_000, fetchImpl = fetch, log = console.log } = {},
) {
  let problems = []
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      problems = await checkSite(siteUrl, expectedVersion, fetchImpl)
    } catch (error) {
      problems = [`request failed: ${error instanceof Error ? error.message : String(error)}`]
    }
    if (problems.length === 0) return []
    log(`Attempt ${attempt}/${attempts}: ${problems.join('; ')}`)
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs))
  }
  return problems
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [siteUrl, expectedVersion] = process.argv.slice(2)
  if (!siteUrl || !expectedVersion) {
    console.error('Usage: node scripts/smoke-check.mjs <site-url> <expected-version>')
    process.exit(2)
  }
  const problems = await smokeCheck(siteUrl, expectedVersion)
  if (problems.length > 0) {
    console.error(`Smoke check failed for ${siteUrl}: ${problems.join('; ')}`)
    process.exit(1)
  }
  console.log(`Smoke check passed: ${siteUrl} serves Ticknest v${expectedVersion}.`)
}

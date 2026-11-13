// Guided self-hosting setup. Run from the repository root:
//   npm run setup
// Walks through creating or selecting a Firebase project, linking billing (Blaze), creating the
// Firestore database, writing the env files, and deploying. Safe to re-run: it reuses what already
// exists, asks before changing any existing value, and deploys only after an explicit "yes".
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { pathToFileURL } from 'node:url'

export const DEFAULT_REGION = 'europe-central2'
export const SUGGESTED_REGIONS = ['europe-central2', 'europe-west1', 'europe-west3', 'us-central1', 'us-east1']
export const WEB_ENV_FILE = '.env.production.local'
export const FUNCTIONS_ENV_FILE = 'functions/.env'
export const DEFAULT_DATABASE = '(default)'

/** True when `version` (such as "v24.1.0") satisfies a range of caret terms like "^22.12.0 || ^24.0.0". */
export function isSupportedNode(version, range) {
  const current = parseVersion(version)
  if (!current) return false
  return range.split('||').some((term) => {
    const wanted = parseVersion(term.trim().replace(/^\^/, ''))
    if (!wanted || current[0] !== wanted[0]) return false
    return current[1] > wanted[1] || (current[1] === wanted[1] && current[2] >= wanted[2])
  })
}

function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(text)
  return match ? match.slice(1).map(Number) : null
}

/** Google Cloud project IDs: 6–30 characters, lowercase letters, digits and hyphens, starting with a letter. */
export function isValidProjectId(id) {
  return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(id)
}

/** Cloud region names such as "europe-central2" or "us-central1". */
export function isValidRegion(region) {
  return /^[a-z]+-[a-z]+\d+$/.test(region)
}

/** Reads KEY=value lines from an env file. Later duplicates win, as in dotenv. */
export function parseEnv(text) {
  const values = new Map()
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line)
    if (match) values.set(match[1], match[2].trim())
  }
  return values
}

/** Compares wanted values with an env file: which keys are missing and which have a different value. */
export function planEnv(text, updates) {
  const current = parseEnv(text)
  const added = []
  const changed = []
  for (const [key, value] of Object.entries(updates)) {
    if (!current.has(key)) added.push(key)
    else if (current.get(key) !== value) changed.push({ key, from: current.get(key), to: value })
  }
  return { added, changed }
}

/** Sets each key in place (keeping comments and order) and appends the keys that are missing. */
export function applyEnv(text, updates) {
  const remaining = new Map(Object.entries(updates))
  const lines = text.split(/\r?\n/).map((line) => {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(line)
    if (!match || !remaining.has(match[1])) return line
    return `${match[1]}=${updates[match[1]]}`
  })
  for (const line of lines) {
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=/.exec(line)
    if (match) remaining.delete(match[1])
  }
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  for (const [key, value] of remaining) lines.push(`${key}=${value}`)
  return `${lines.join('\n')}\n`
}

function readFirebaserc(text) {
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new SetupError('.firebaserc is not valid JSON. Fix or delete it, then run npm run setup again.')
  }
}

/** The project that .firebaserc selects by default, or null. */
export function readDefaultProject(text) {
  return readFirebaserc(text).projects?.default ?? null
}

/** Returns .firebaserc text that selects `projectId` as the default and keeps any other aliases and targets. */
export function mergeFirebaserc(text, projectId) {
  const config = readFirebaserc(text)
  return `${JSON.stringify({ ...config, projects: { ...config.projects, default: projectId } }, null, 2)}\n`
}

/** Parses `firebase --json` output and returns its result, or throws with the CLI's error message. */
export function parseCliJson(stdout) {
  const start = stdout.indexOf('{')
  if (start === -1) throw new Error('The Firebase CLI returned no JSON output.')
  const output = JSON.parse(stdout.slice(start))
  if (output.status !== 'success') throw new Error(output.error ?? 'The Firebase CLI command failed.')
  return output.result
}

/** Picks the web app's public config out of `firebase apps:sdkconfig WEB --json`. */
export function readWebConfig(result) {
  const config = result?.sdkConfig ?? result
  const keys = ['apiKey', 'authDomain', 'projectId', 'appId']
  if (!config || keys.some((key) => typeof config[key] !== 'string' || !config[key])) {
    throw new Error('The Firebase web app config is missing apiKey, authDomain, projectId or appId.')
  }
  return { apiKey: config.apiKey, authDomain: config.authDomain, projectId: config.projectId, appId: config.appId }
}

/** The values the setup writes to the web app's production env file. */
export function webEnvValues(config, region) {
  return {
    VITE_USE_FIREBASE_EMULATORS: 'false',
    VITE_FIREBASE_API_KEY: config.apiKey,
    VITE_FIREBASE_AUTH_DOMAIN: config.authDomain,
    VITE_FIREBASE_PROJECT_ID: config.projectId,
    VITE_FIREBASE_APP_ID: config.appId,
    VITE_FIREBASE_FUNCTIONS_REGION: region,
    VITE_DEMO_MODE: 'false',
  }
}

/** Finds the location of the project's default Firestore database in `firestore:databases:list` output. */
export function defaultDatabaseLocation(databases) {
  const database = (databases ?? []).find((db) => db.name?.endsWith(`/databases/${DEFAULT_DATABASE}`))
  return database ? (database.locationId ?? null) : null
}

/** Strips the "billingAccounts/" prefix from a billing account resource name. */
export function billingAccountId(name) {
  return name.replace(/^billingAccounts\//, '')
}

/** The deploy targets: Hosting is left out when the web app is served elsewhere, such as Vercel. */
export function deployTargets(useFirebaseHosting) {
  const targets = ['firestore:rules', 'firestore:indexes', 'functions']
  return useFirebaseHosting ? ['hosting', ...targets] : targets
}

export function consoleUrls(projectId) {
  const firebase = `https://console.firebase.google.com/project/${projectId}`
  return {
    billing: `${firebase}/usage/details`,
    authProviders: `${firebase}/authentication/providers`,
    authDomains: `${firebase}/authentication/settings`,
    budgets: 'https://console.cloud.google.com/billing/budgets',
    site: `https://${projectId}.web.app`,
  }
}

// ---------------------------------------------------------------------------------------------
// Interactive flow

class SetupError extends Error {}

const root = process.cwd()
const firebaseBin = join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'firebase.cmd' : 'firebase')

function say(message = '') {
  console.log(message)
}

function step(title) {
  say()
  say(`== ${title}`)
}

async function ask(question, fallback = '') {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  try {
    const hint = fallback ? ` [${fallback}]` : ''
    const answer = (await rl.question(`${question}${hint}: `)).trim()
    return answer || fallback
  } finally {
    rl.close()
  }
}

async function confirm(question, defaultYes = false) {
  const answer = (await ask(`${question} ${defaultYes ? '(Y/n)' : '(y/N)'}`)).toLowerCase()
  if (!answer) return defaultYes
  return answer === 'y' || answer === 'yes'
}

async function pause(message) {
  await ask(`${message}\nPress Enter when done`)
}

/** Runs a command with the terminal attached, for commands that prompt or stream output. */
function runInteractive(command, args) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' })
  return result.status === 0
}

/** Runs a command and returns its stdout, or null when it fails or is not installed. */
function capture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', shell: process.platform === 'win32' })
  if (result.error || result.status !== 0) return null
  return result.stdout
}

function firebaseJson(args) {
  const result = spawnSync(firebaseBin, [...args, '--json', '--non-interactive'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  return parseCliJson(result.stdout ?? '')
}

function readText(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

async function checkPrerequisites() {
  step('1. Prerequisites')
  const engines = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).engines.node
  if (!isSupportedNode(process.version, engines)) {
    throw new SetupError(`Node.js ${process.version} is not supported. Install a version matching ${engines}.`)
  }
  say(`Node.js ${process.version}: OK`)

  if (!existsSync(firebaseBin)) {
    if (!(await confirm('Dependencies are not installed. Run npm install now?', true))) {
      throw new SetupError('Run npm install, then npm run setup again.')
    }
    if (!runInteractive('npm', ['install'])) throw new SetupError('npm install failed.')
  }
  say('Firebase CLI: OK')

  const accounts = firebaseJson(['login:list'])
  if (!Array.isArray(accounts) || accounts.length === 0) {
    say('You are not signed in to the Firebase CLI. A browser window opens to sign in.')
    if (!runInteractive(firebaseBin, ['login'])) throw new SetupError('Firebase sign-in failed.')
  } else {
    say('Signed in to the Firebase CLI: OK')
  }

  const hasGcloud = capture('gcloud', ['--version']) !== null
  say(
    hasGcloud ? 'gcloud CLI: found (used to link billing)' : 'gcloud CLI: not found (billing is linked in the console)',
  )
  return { hasGcloud }
}

async function chooseProject() {
  step('2. Firebase project')
  const rcPath = join(root, '.firebaserc')
  const current = readDefaultProject(readText(rcPath))
  const projects = firebaseJson(['projects:list']) ?? []
  if (projects.length > 0) {
    say('Your Firebase projects:')
    for (const project of projects) say(`  - ${project.projectId} (${project.displayName ?? 'no name'})`)
  }
  const fallback = current ?? (projects.length === 0 ? 'ticknest-' + Math.random().toString(36).slice(2, 8) : '')
  let projectId = ''
  while (!isValidProjectId(projectId)) {
    projectId = await ask('Project ID to use (an existing one, or a new ID to create)', fallback)
    if (!isValidProjectId(projectId)) {
      say('Use 6–30 lowercase letters, digits or hyphens, starting with a letter and not ending with a hyphen.')
    }
  }

  if (!projects.some((project) => project.projectId === projectId)) {
    if (!(await confirm(`Create a new Firebase project "${projectId}"?`, true))) {
      throw new SetupError('No project selected.')
    }
    if (!runInteractive(firebaseBin, ['projects:create', projectId, '--display-name', 'Ticknest'])) {
      throw new SetupError('Creating the project failed. Project IDs are global, so try a different ID.')
    }
  }

  if (current !== projectId) {
    if (current && !(await confirm(`.firebaserc selects "${current}". Switch it to "${projectId}"?`))) {
      throw new SetupError(`Kept .firebaserc on "${current}". Re-run and choose that project to continue.`)
    }
    const rc = mergeFirebaserc(readText(rcPath), projectId)
    writeFileSync(rcPath, rc)
    say(`.firebaserc now selects ${projectId}.`)
  }
  return projectId
}

async function linkBilling(projectId, hasGcloud) {
  step('3. Billing (Blaze plan)')
  say('Ticknest uses Cloud Functions, which need the Blaze (pay-as-you-go) plan with a billing account.')
  say('Small teams usually stay within the free quotas, but usage beyond them is billed.')
  const urls = consoleUrls(projectId)

  if (hasGcloud) {
    const describe = capture('gcloud', ['billing', 'projects', 'describe', projectId, '--format=json'])
    if (describe && JSON.parse(describe).billingEnabled) {
      say('Billing is already enabled: OK')
      return
    }
    const listed = capture('gcloud', ['billing', 'accounts', 'list', '--filter=open=true', '--format=json'])
    const accounts = listed ? JSON.parse(listed) : []
    if (describe && accounts.length > 0) {
      say('Open billing accounts:')
      accounts.forEach((account, index) =>
        say(`  ${index + 1}. ${account.displayName} (${billingAccountId(account.name)})`),
      )
      const choice = Number(await ask('Billing account to link (number, or Enter to use the console instead)', '1'))
      const account = accounts[choice - 1]
      if (
        account &&
        (await confirm(`Link "${account.displayName}" to ${projectId}? Usage beyond free quotas is billed.`))
      ) {
        const accountId = billingAccountId(account.name)
        if (runInteractive('gcloud', ['billing', 'projects', 'link', projectId, `--billing-account=${accountId}`])) {
          say('Billing linked: OK')
          return
        }
        say('Linking with gcloud failed. Use the console instead.')
      }
    } else {
      say('gcloud could not read billing for this project (sign in with `gcloud auth login`). Use the console instead.')
    }
  }

  await pause(`Upgrade the project to Blaze here:\n  ${urls.billing}`)
}

async function chooseRegion(projectId) {
  step('4. Region and Firestore database')
  let databases = []
  try {
    databases = firebaseJson(['firestore:databases:list', '--project', projectId])
  } catch {
    // A new project may not have the Firestore API enabled yet; creating the database enables it.
  }
  const location = defaultDatabaseLocation(databases)
  if (location) say(`The Firestore database already exists in ${location}. Its location cannot be changed.`)

  say(`Suggested regions: ${SUGGESTED_REGIONS.join(', ')}. ${DEFAULT_REGION} (Warsaw) suits Polish and EU users.`)
  const fallback = location && isValidRegion(location) ? location : DEFAULT_REGION
  let region = ''
  while (!isValidRegion(region)) {
    region = await ask('Region for Cloud Functions' + (location ? '' : ' and the Firestore database'), fallback)
    if (!isValidRegion(region)) say('Enter a single region such as europe-central2.')
  }

  if (!location) {
    if (!(await confirm(`Create the Firestore database in ${region}? The location is permanent.`, true))) {
      throw new SetupError('The Firestore database is required.')
    }
    const created = runInteractive(firebaseBin, [
      'firestore:databases:create',
      DEFAULT_DATABASE,
      '--location',
      region,
      '--project',
      projectId,
    ])
    if (!created) throw new SetupError('Creating the Firestore database failed. Check that billing is enabled.')
  }
  return region
}

async function setUpAuth(projectId) {
  step('5. Sign-in providers')
  const urls = consoleUrls(projectId)
  say('The Firebase CLI cannot turn on sign-in providers, so do this in the console:')
  say('  - Enable Email/Password (required).')
  say('  - Enable Google (optional). It may ask you to set up the OAuth consent screen.')
  await pause(`  ${urls.authProviders}`)
}

async function writeEnvFile(path, baseText, updates) {
  const fullPath = join(root, path)
  const exists = existsSync(fullPath)
  const text = exists ? readFileSync(fullPath, 'utf8') : baseText
  const { added, changed } = planEnv(text, updates)
  let wanted = updates
  if (changed.length > 0) {
    say(`${path} already has different values:`)
    for (const change of changed) say(`  ${change.key}: ${change.from} -> ${change.to}`)
    if (!(await confirm(`Update these values in ${path}?`))) {
      wanted = Object.fromEntries(added.map((key) => [key, updates[key]]))
    }
  }
  const next = applyEnv(text, wanted)
  if (exists && next === text) {
    say(`${path}: up to date`)
    return
  }
  writeFileSync(fullPath, next)
  say(`${path}: written`)
}

async function writeEnv(projectId, region) {
  step('6. Configuration files')
  let apps = firebaseJson(['apps:list', 'WEB', '--project', projectId]) ?? []
  if (apps.length === 0) {
    say('Creating the Firebase web app. Accept the default Hosting site if you are asked.')
    if (!runInteractive(firebaseBin, ['apps:create', 'WEB', 'Ticknest', '--project', projectId])) {
      throw new SetupError('Creating the Firebase web app failed.')
    }
    apps = firebaseJson(['apps:list', 'WEB', '--project', projectId]) ?? []
  }
  const appId = apps[0]?.appId
  if (!appId) throw new SetupError('No Firebase web app found in the project.')
  if (apps.length > 1) {
    say(`The project has ${apps.length} web apps; using "${apps[0].displayName ?? appId}".`)
  }
  const config = readWebConfig(firebaseJson(['apps:sdkconfig', 'WEB', appId, '--project', projectId]))

  await writeEnvFile(WEB_ENV_FILE, readText(join(root, '.env.example')), webEnvValues(config, region))
  await writeEnvFile(FUNCTIONS_ENV_FILE, readText(join(root, 'functions', '.env.example')), {
    FUNCTIONS_REGION: region,
  })
  say(`${WEB_ENV_FILE} is used by production builds only, so \`npm run dev\` keeps using the emulators.`)
}

async function deploy(projectId) {
  step('7. Deploy')
  const useFirebaseHosting = await confirm('Serve the web app from Firebase Hosting? (Answer no for Vercel)', true)
  const targets = deployTargets(useFirebaseHosting)
  say(`This deploys ${targets.join(', ')} to the project "${projectId}".`)
  if (!(await confirm('Deploy now?'))) {
    say('Skipped. Deploy later with:')
    say(`  npx firebase deploy --only ${targets.join(',')} --project ${projectId}`)
    return useFirebaseHosting
  }
  if (!existsSync(join(root, 'functions', 'node_modules'))) {
    if (!runInteractive('npm', ['--prefix', 'functions', 'install']))
      throw new SetupError('Installing Functions failed.')
  }
  if (useFirebaseHosting && !runInteractive('npm', ['run', 'build'])) throw new SetupError('The build failed.')
  if (!runInteractive(firebaseBin, ['deploy', '--only', targets.join(','), '--project', projectId])) {
    throw new SetupError('The deploy failed. Fix the error above, then run npm run setup again.')
  }
  return useFirebaseHosting
}

function printNextSteps(projectId, useFirebaseHosting) {
  step('Done')
  const urls = consoleUrls(projectId)
  if (useFirebaseHosting) say(`Your Ticknest: ${urls.site}`)
  else say('Deploy the web app on Vercel with the VITE_* values from .env.production.local (docs/operations.md).')
  say()
  say('Next steps:')
  say(`  - Set a budget alert (alerts notify you; they do not cap spending): ${urls.budgets}`)
  if (!useFirebaseHosting) say(`  - Add your web app's domain to the authorized domains: ${urls.authDomains}`)
  say('  - Sign up in the app. The first account creates the first workspace.')
  say('  - Optional: App Check, backups and the GitHub Actions deploy, see docs/operations.md.')
}

async function main() {
  say('Ticknest guided setup. Nothing is deployed until you confirm it. Press Ctrl+C to stop at any time.')
  const { hasGcloud } = await checkPrerequisites()
  const projectId = await chooseProject()
  await linkBilling(projectId, hasGcloud)
  const region = await chooseRegion(projectId)
  await setUpAuth(projectId)
  await writeEnv(projectId, region)
  const useFirebaseHosting = await deploy(projectId)
  printNextSteps(projectId, useFirebaseHosting)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    console.error()
    console.error(error instanceof SetupError ? error.message : error)
    process.exitCode = 1
  })
}

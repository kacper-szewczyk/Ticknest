// `npm run demo:seed`: clears the local Auth and Firestore emulators and seeds them with the demo data.
// It only ever talks to emulators on this machine, under a `demo-` project that cannot reach real resources.
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { DEMO_ACCOUNTS } from './accounts'
import { buildDemoData, writeDemoData } from './seed'

// Must match the project `npm run emulators` starts.
const PROJECT_ID = 'demo-ticknest'
// Defaults follow the ports in firebase.json.
const firestoreHost = (process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080')
const authHost = (process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099')

function assertLocal(host: string, name: string): void {
  if (!/^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(host)) {
    throw new Error(`${name} must point to a local emulator, not ${host}.`)
  }
}

async function clear(url: string, name: string): Promise<void> {
  // The emulators accept "owner" as an admin token.
  const response = await fetch(url, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } })
  if (!response.ok) throw new Error(`Could not clear the ${name} emulator (HTTP ${response.status}).`)
}

async function main(): Promise<void> {
  assertLocal(firestoreHost, 'FIRESTORE_EMULATOR_HOST')
  assertLocal(authHost, 'FIREBASE_AUTH_EMULATOR_HOST')
  try {
    await clear(`http://${firestoreHost}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`, 'Firestore')
    await clear(`http://${authHost}/emulator/v1/projects/${PROJECT_ID}/accounts`, 'Auth')
  } catch (error) {
    throw new Error('Start the emulators with `npm run emulators` first.', { cause: error })
  }

  const app = initializeApp({ projectId: PROJECT_ID })
  const data = buildDemoData(new Date())
  await writeDemoData(getAuth(app), getFirestore(app), data)

  const entries = data.documents.filter((document) => document.path.includes('/timeEntries/')).length
  console.log(`Seeded ${data.users.length} accounts and ${entries} time entries in ${PROJECT_ID}.`)
  for (const account of DEMO_ACCOUNTS) console.log(`  ${account.role.padEnd(7)} ${account.email} / ${account.password}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})

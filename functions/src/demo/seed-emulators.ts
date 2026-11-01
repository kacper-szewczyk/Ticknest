// `npm run demo:seed`: wipes the local Auth and Firestore emulators and seeds them with the demo data.
// It only ever talks to emulators on this machine, under a `demo-` project that cannot reach real resources.
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { DEMO_ACCOUNTS } from './accounts'
import { resetDemoProject } from './reset'

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

async function main(): Promise<void> {
  assertLocal(firestoreHost, 'FIRESTORE_EMULATOR_HOST')
  assertLocal(authHost, 'FIREBASE_AUTH_EMULATOR_HOST')
  try {
    await fetch(`http://${firestoreHost}/`)
    await fetch(`http://${authHost}/`)
  } catch (error) {
    throw new Error('Start the emulators with `npm run emulators` first.', { cause: error })
  }

  // The same wipe and seed as the scheduled resetDemo function.
  const app = initializeApp({ projectId: PROJECT_ID })
  const result = await resetDemoProject(getAuth(app), getFirestore(app), new Date())

  console.log(
    `Deleted ${result.deletedUsers} accounts and ${result.deletedDocuments} documents, then seeded ` +
      `${result.seededUsers} accounts and ${result.seededTimeEntries} time entries in ${PROJECT_ID}.`,
  )
  for (const account of DEMO_ACCOUNTS) console.log(`  ${account.role.padEnd(7)} ${account.email} / ${account.password}`)
}

main().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})

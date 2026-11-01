// Demo mode params. Off by default: with DEMO_MODE unset or false, nothing in functions/src/demo runs.
import { getApp } from 'firebase-admin/app'
import { defineBoolean, defineString } from 'firebase-functions/params'
import { checkDemoGuard, type DemoGuardResult } from './guard'

export const DEMO_MODE = defineBoolean('DEMO_MODE', {
  default: false,
  description: 'Run the daily demo reset. Deletes ALL Auth users and Firestore data in DEMO_PROJECT_ID.',
})

// A second key so a copied functions/.env with DEMO_MODE=true still cannot wipe a different project.
export const DEMO_PROJECT_ID = defineString('DEMO_PROJECT_ID', {
  default: '',
  description: 'The only Firebase project ID the demo reset may wipe. Must equal the deployed project ID.',
})

function getRuntimeProjectId(): string | undefined {
  return process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT ?? getApp().options.projectId
}

/** Evaluates the guard against the current params and runtime project. Call at run time, not at module load. */
export function getDemoGuardResult(): DemoGuardResult {
  return checkDemoGuard({
    demoMode: DEMO_MODE.value(),
    demoProjectId: DEMO_PROJECT_ID.value(),
    runtimeProjectId: getRuntimeProjectId(),
  })
}

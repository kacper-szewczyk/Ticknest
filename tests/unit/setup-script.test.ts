import { describe, expect, it } from 'vitest'
import {
  applyEnv,
  billingAccountId,
  defaultDatabaseLocation,
  deployTargets,
  isSupportedNode,
  isValidProjectId,
  isValidRegion,
  mergeFirebaserc,
  parseCliJson,
  planEnv,
  readDefaultProject,
  readWebConfig,
  webEnvValues,
} from '../../scripts/setup.mjs'

const engines = '^22.12.0 || ^24.0.0 || ^26.0.0'

describe('isSupportedNode', () => {
  it('accepts versions inside a caret range', () => {
    expect(isSupportedNode('v22.12.0', engines)).toBe(true)
    expect(isSupportedNode('v22.20.1', engines)).toBe(true)
    expect(isSupportedNode('v24.0.0', engines)).toBe(true)
    expect(isSupportedNode('v26.3.2', engines)).toBe(true)
  })

  it('rejects versions below the minimum or with another major', () => {
    expect(isSupportedNode('v22.11.9', engines)).toBe(false)
    expect(isSupportedNode('v20.18.0', engines)).toBe(false)
    expect(isSupportedNode('v23.1.0', engines)).toBe(false)
    expect(isSupportedNode('not-a-version', engines)).toBe(false)
  })
})

describe('isValidProjectId', () => {
  it('accepts Google Cloud project IDs', () => {
    expect(isValidProjectId('ticknest-acme')).toBe(true)
    expect(isValidProjectId('abc123')).toBe(true)
  })

  it('rejects IDs that are too short, too long, or badly formed', () => {
    expect(isValidProjectId('abc')).toBe(false)
    expect(isValidProjectId('a'.repeat(31))).toBe(false)
    expect(isValidProjectId('1ticknest')).toBe(false)
    expect(isValidProjectId('ticknest-')).toBe(false)
    expect(isValidProjectId('Ticknest')).toBe(false)
    expect(isValidProjectId('tick_nest')).toBe(false)
  })
})

describe('isValidRegion', () => {
  it('accepts single regions and rejects multi-regions or junk', () => {
    expect(isValidRegion('europe-central2')).toBe(true)
    expect(isValidRegion('us-central1')).toBe(true)
    expect(isValidRegion('eur3')).toBe(false)
    expect(isValidRegion('europe central2')).toBe(false)
  })
})

describe('planEnv and applyEnv', () => {
  const existing = ['# Comment', 'VITE_FIREBASE_PROJECT_ID=old-project', 'VITE_DEMO_MODE=false', ''].join('\n')

  it('reports missing keys and changed values', () => {
    const plan = planEnv(existing, {
      VITE_FIREBASE_PROJECT_ID: 'new-project',
      VITE_DEMO_MODE: 'false',
      VITE_FIREBASE_APP_ID: 'app',
    })
    expect(plan.added).toEqual(['VITE_FIREBASE_APP_ID'])
    expect(plan.changed).toEqual([{ key: 'VITE_FIREBASE_PROJECT_ID', from: 'old-project', to: 'new-project' }])
  })

  it('updates values in place, keeps comments, and appends new keys', () => {
    const next = applyEnv(existing, { VITE_FIREBASE_PROJECT_ID: 'new-project', VITE_FIREBASE_APP_ID: 'app' })
    expect(next).toBe(
      [
        '# Comment',
        'VITE_FIREBASE_PROJECT_ID=new-project',
        'VITE_DEMO_MODE=false',
        'VITE_FIREBASE_APP_ID=app',
        '',
      ].join('\n'),
    )
  })

  it('leaves a file that is already up to date unchanged, so re-runs are no-ops', () => {
    expect(planEnv(existing, { VITE_DEMO_MODE: 'false' })).toEqual({ added: [], changed: [] })
    expect(applyEnv(existing, { VITE_DEMO_MODE: 'false' })).toBe(existing)
  })

  it('starts a new file from the example text', () => {
    expect(applyEnv('', { FUNCTIONS_REGION: 'europe-central2' })).toBe('FUNCTIONS_REGION=europe-central2\n')
  })
})

describe('.firebaserc', () => {
  it('reads the default project', () => {
    expect(readDefaultProject('')).toBeNull()
    expect(readDefaultProject('{"projects":{"default":"acme"}}')).toBe('acme')
  })

  it('sets the default and keeps other aliases and targets', () => {
    const text = JSON.stringify({ projects: { default: 'old', staging: 'acme-staging' }, targets: { x: {} } })
    expect(JSON.parse(mergeFirebaserc(text, 'acme'))).toEqual({
      projects: { default: 'acme', staging: 'acme-staging' },
      targets: { x: {} },
    })
    expect(JSON.parse(mergeFirebaserc('', 'acme'))).toEqual({ projects: { default: 'acme' } })
  })

  it('refuses invalid JSON instead of overwriting it', () => {
    expect(() => readDefaultProject('{ not json')).toThrow(/not valid JSON/)
    expect(() => mergeFirebaserc('{ not json', 'acme')).toThrow(/not valid JSON/)
  })
})

describe('parseCliJson', () => {
  it('returns the result of a successful command, skipping any leading log lines', () => {
    expect(parseCliJson('i  Loading...\n{"status":"success","result":[{"projectId":"acme"}]}')).toEqual([
      { projectId: 'acme' },
    ])
  })

  it('throws the CLI error for a failed command', () => {
    expect(() => parseCliJson('{"status":"error","error":"Not logged in"}')).toThrow('Not logged in')
    expect(() => parseCliJson('')).toThrow(/no JSON/)
  })
})

describe('readWebConfig and webEnvValues', () => {
  const sdkConfig = { apiKey: 'key', authDomain: 'acme.firebaseapp.com', projectId: 'acme', appId: '1:2:web:3' }

  it('reads the config from apps:sdkconfig output', () => {
    expect(
      readWebConfig({ fileName: 'x', fileContents: 'y', sdkConfig: { ...sdkConfig, storageBucket: 'b' } }),
    ).toEqual(sdkConfig)
    expect(() => readWebConfig({ sdkConfig: { apiKey: 'key' } })).toThrow(/missing/)
  })

  it('maps the config to production env values with emulators and demo mode off', () => {
    expect(webEnvValues(sdkConfig, 'europe-central2')).toEqual({
      VITE_USE_FIREBASE_EMULATORS: 'false',
      VITE_FIREBASE_API_KEY: 'key',
      VITE_FIREBASE_AUTH_DOMAIN: 'acme.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'acme',
      VITE_FIREBASE_APP_ID: '1:2:web:3',
      VITE_FIREBASE_FUNCTIONS_REGION: 'europe-central2',
      VITE_DEMO_MODE: 'false',
    })
  })
})

describe('helpers', () => {
  it('finds the default Firestore database location', () => {
    expect(
      defaultDatabaseLocation([
        { name: 'projects/acme/databases/other', locationId: 'us-east1' },
        { name: 'projects/acme/databases/(default)', locationId: 'europe-central2' },
      ]),
    ).toBe('europe-central2')
    expect(defaultDatabaseLocation([])).toBeNull()
    expect(defaultDatabaseLocation(undefined)).toBeNull()
  })

  it('strips the billing account prefix', () => {
    expect(billingAccountId('billingAccounts/0X0X0X-0X0X0X-0X0X0X')).toBe('0X0X0X-0X0X0X-0X0X0X')
  })

  it('leaves Hosting out of the deploy when the web app is served elsewhere', () => {
    expect(deployTargets(true)).toEqual(['hosting', 'firestore:rules', 'firestore:indexes', 'functions'])
    expect(deployTargets(false)).toEqual(['firestore:rules', 'firestore:indexes', 'functions'])
  })
})

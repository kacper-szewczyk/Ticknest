// Types for scripts/setup.mjs, so the unit tests can import it.
export interface WebConfig {
  apiKey: string
  authDomain: string
  projectId: string
  appId: string
}

export const DEFAULT_REGION: string
export const SUGGESTED_REGIONS: string[]
export const WEB_ENV_FILE: string
export const FUNCTIONS_ENV_FILE: string
export const DEFAULT_DATABASE: string

export function isSupportedNode(version: string, range: string): boolean
export function isValidProjectId(id: string): boolean
export function isValidRegion(region: string): boolean
export function parseEnv(text: string): Map<string, string>
export function planEnv(
  text: string,
  updates: Record<string, string>,
): { added: string[]; changed: { key: string; from: string; to: string }[] }
export function applyEnv(text: string, updates: Record<string, string>): string
export function readDefaultProject(text: string): string | null
export function mergeFirebaserc(text: string, projectId: string): string
export function parseCliJson(stdout: string): unknown
export function readWebConfig(result: unknown): WebConfig
export function webEnvValues(config: WebConfig, region: string): Record<string, string>
export function defaultDatabaseLocation(
  databases: { name?: string; locationId?: string }[] | null | undefined,
): string | null
export function billingAccountId(name: string): string
export function deployTargets(useFirebaseHosting: boolean): string[]
export function consoleUrls(projectId: string): {
  billing: string
  authProviders: string
  authDomains: string
  budgets: string
  site: string
}

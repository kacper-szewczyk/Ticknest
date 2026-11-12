// Types for scripts/smoke-check.mjs, so the unit tests can import it.
type Fetch = (url: string, init?: RequestInit) => Promise<Response>

export const VERSION_META: string
export function readVersion(html: string): string | null
export function readEntryScript(html: string): string | null
export function checkSite(siteUrl: string, expectedVersion: string, fetchImpl?: Fetch): Promise<string[]>
export function smokeCheck(
  siteUrl: string,
  expectedVersion: string,
  options?: { attempts?: number; delayMs?: number; fetchImpl?: Fetch; log?: (message: string) => void },
): Promise<string[]>

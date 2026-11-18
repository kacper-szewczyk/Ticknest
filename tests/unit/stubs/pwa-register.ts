// Stands in for vite-plugin-pwa's `virtual:pwa-register`, which only exists inside a Vite build (see vitest.config.ts).
import type { RegisterSWOptions } from 'vite-plugin-pwa/types'

export function registerSW(options: RegisterSWOptions = {}): (reloadPage?: boolean) => Promise<void> {
  void options
  return async () => {}
}

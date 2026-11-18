import { useSyncExternalStore } from 'react'
import { getPwaState, subscribeToPwaState, type PwaState } from './lib/pwa'

export function usePwaState(): PwaState {
  return useSyncExternalStore(subscribeToPwaState, getPwaState, getPwaState)
}

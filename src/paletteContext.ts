import { createContext, useContext } from 'react'
import { DEFAULT_PALETTE_CHOICE, type PaletteChoice } from './palettes'

export type PaletteContextValue = {
  choice: PaletteChoice
  /** Applies a palette immediately; persisting it to the user's profile is the caller's job. */
  applyPalette: (choice: PaletteChoice) => void
}

export const PaletteContext = createContext<PaletteContextValue>({
  choice: DEFAULT_PALETTE_CHOICE,
  applyPalette: () => {},
})

export function usePalette(): PaletteContextValue {
  return useContext(PaletteContext)
}

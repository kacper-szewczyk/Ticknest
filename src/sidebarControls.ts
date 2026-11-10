import { createContext, useContext } from 'react'

export type SidebarControls = { expand: () => void }

export const SidebarControlsContext = createContext<SidebarControls>({ expand: () => {} })

/** Lets content rendered in the collapsed sidebar rail reopen the full sidebar. */
export function useSidebarControls(): SidebarControls {
  return useContext(SidebarControlsContext)
}

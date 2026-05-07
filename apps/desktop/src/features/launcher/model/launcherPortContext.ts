import { createContext, useContext } from 'react'
import type { LauncherPort } from './launcherPort'

export const LauncherPortContext = createContext<LauncherPort | null>(null)

export function useLauncherPort(): LauncherPort {
  const port = useContext(LauncherPortContext)
  if (!port) {
    throw new Error('useLauncherPort must be used within a LauncherProvider.')
  }
  return port
}
